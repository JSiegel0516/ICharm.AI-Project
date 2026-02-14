import asyncio
import logging
import os
from typing import Any, Dict, List, Literal, Optional, cast
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .location_search import router as geocode_router
from .chat.chat_handler import ClimateAnalysisChatHandler
from .tools.knowledge_base import PlatformKnowledgeBase

DEFAULT_MODEL = os.getenv("LLAMA_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")
HF_CHAT_URL = os.getenv(
    "HF_CHAT_URL",
    "https://router.huggingface.co/v1/chat/completions",
)
DATA_API_URL = os.getenv("DATA_API_URL", "http://localhost:8000")
CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")

logger = logging.getLogger(__name__)

app = FastAPI(title="iCHARM LLM Service")
app.include_router(geocode_router)

TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}


knowledge_base = PlatformKnowledgeBase(persist_directory=CHROMA_PATH)


class HFClient:
    def __init__(self, url: str, token: str, model: str) -> None:
        self.url = url
        self.token = token
        self.model = model

    async def generate(self, messages: List[Dict[str, str]]) -> str:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        is_chat_completion = _is_chat_completion_endpoint(self.url)

        if is_chat_completion:
            request_body: Dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "stream": False,
            }
            prompt = ""
        else:
            prompt_messages = []
            for message in messages:
                role = message.get("role")
                if role not in ("system", "user", "assistant"):
                    role = "user"
                prompt_messages.append(
                    ChatMessage(
                        role=cast(Literal["system", "user", "assistant"], role),
                        content=message.get("content", ""),
                    )
                )
            prompt = _build_prompt(prompt_messages)
            request_body = {"inputs": prompt}

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0)
        ) as client:
            response = await client.post(self.url, json=request_body, headers=headers)

        response.raise_for_status()

        content_type = (response.headers.get("content-type") or "").lower()
        body_text = response.text

        if "application/json" in content_type:
            result: Any = response.json()
        elif not is_chat_completion and content_type.startswith("text/"):
            result = body_text
        else:
            raise HTTPException(
                status_code=502,
                detail="Upstream returned non-JSON response",
            )

        if is_chat_completion:
            choices = result.get("choices") or []
            if not choices:
                raise HTTPException(status_code=502, detail="LLM returned no choices")

            completion = choices[0]
            message = completion.get("message") or {}
            content = message.get("content")
            if not isinstance(content, str) or not content.strip():
                raise HTTPException(
                    status_code=502, detail="LLM returned empty content"
                )
            return content.strip()

        generated_text = _extract_generated_text(result, prompt)
        if not generated_text or not generated_text.strip():
            raise HTTPException(status_code=502, detail="LLM returned empty content")
        return generated_text.strip()


llm_client = None
try:
    from anthropic import AsyncAnthropic

    if os.getenv("ANTHROPIC_API_KEY"):
        llm_client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        logger.info("Using Anthropic Claude")
except ImportError:
    llm_client = None

if not llm_client:
    try:
        from openai import AsyncOpenAI

        if os.getenv("OPENAI_API_KEY"):
            llm_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            logger.info("Using OpenAI GPT-4")
    except ImportError:
        llm_client = None

if not llm_client:
    api_key = os.getenv("HF_TOKEN") or os.getenv("LLAMA_API_KEY") or ""
    llm_client = HFClient(
        url=HF_CHAT_URL,
        token=api_key,
        model=DEFAULT_MODEL,
    )
    logger.info("Using HuggingFace")

chat_handler = ClimateAnalysisChatHandler(
    llm_client=llm_client,
    data_api_url=DATA_API_URL,
    knowledge_base=knowledge_base,
)


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1)
    model: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    stream: Optional[bool] = False
    max_tokens: Optional[int] = Field(default=None, gt=0)


class ChatResponse(BaseModel):
    content: str
    model: Optional[str] = None
    raw: Dict[str, Any]


class ChatAnalyzeRequest(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1)
    context: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None


class ChatAnalyzeResponse(BaseModel):
    message: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    reasoning: Optional[str] = None


def _is_chat_completion_endpoint(url: str) -> bool:
    try:
        path = urlparse(url).path.rstrip("/")
    except ValueError:
        return False
    return path.endswith("/chat/completions")


ROLE_PREFIX: Dict[str, str] = {
    "system": "System",
    "user": "User",
    "assistant": "Assistant",
}


def _build_prompt(messages: List[ChatMessage]) -> str:
    lines: List[str] = []
    for message in messages:
        role = ROLE_PREFIX.get(message.role, message.role.title())
        lines.append(f"{role}: {message.content}")
    lines.append("Assistant:")
    return "\n".join(lines)


def _extract_generated_text(result: Any, prompt: str) -> Optional[str]:
    text: Optional[str] = None

    if isinstance(result, list) and result:
        candidate = result[0]
        if isinstance(candidate, dict):
            for key in ("generated_text", "text", "output_text", "content"):
                value = candidate.get(key)
                if isinstance(value, str):
                    text = value
                    break
            else:
                value = candidate.get("generation")
                text = value if isinstance(value, str) else None
        elif isinstance(candidate, str):
            text = candidate
    elif isinstance(result, dict):
        for key in ("generated_text", "text", "output_text", "content"):
            value = result.get(key)
            if isinstance(value, str):
                text = value
                break
    elif isinstance(result, str):
        text = result

    if isinstance(text, str) and prompt and text.startswith(prompt):
        return text[len(prompt) :].lstrip()  # noqa E203
    return text


@app.get("/health", tags=["health"])
async def health() -> Dict[str, Any]:
    kb_count = (
        knowledge_base.collection.count()
        if knowledge_base.collection is not None
        else len(knowledge_base.docs)
    )
    return {
        "status": "ok",
        "llm_backend": type(llm_client).__name__,
        "data_api": DATA_API_URL,
        "knowledge_base_docs": kb_count,
    }


@app.on_event("startup")
async def startup() -> None:
    existing_count = (
        knowledge_base.collection.count()
        if knowledge_base.collection is not None
        else len(knowledge_base.docs)
    )
    if existing_count == 0:
        logger.info("Indexing platform documentation...")
        knowledge_base.index_documentation()
        logger.info("Documentation indexed successfully")


@app.on_event("shutdown")
async def shutdown() -> None:
    await chat_handler.tools.close()


@app.post("/v1/chat", response_model=ChatResponse, tags=["chat"])
async def chat(payload: ChatRequest) -> ChatResponse:
    api_key = os.getenv("HF_TOKEN") or os.getenv("LLAMA_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing Hugging Face API key")

    model = payload.model or DEFAULT_MODEL

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    is_chat_completion = _is_chat_completion_endpoint(HF_CHAT_URL)

    if is_chat_completion:
        request_body: Dict[str, Any] = {
            "model": model,
            "messages": [message.dict() for message in payload.messages],
            "stream": bool(payload.stream),
        }
        if payload.temperature is not None:
            request_body["temperature"] = payload.temperature
        if payload.max_tokens is not None:
            request_body["max_tokens"] = payload.max_tokens
        prompt = ""
    else:
        prompt = _build_prompt(payload.messages)
        request_body = {"inputs": prompt}
        parameters: Dict[str, Any] = {}
        if payload.temperature is not None:
            parameters["temperature"] = payload.temperature
        if payload.max_tokens is not None:
            parameters["max_new_tokens"] = payload.max_tokens
        if parameters:
            request_body["parameters"] = parameters

    attempt = 0
    backoff_seconds = 2.0
    max_attempts = 2

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
        while True:
            try:
                response = await client.post(
                    HF_CHAT_URL,
                    json=request_body,
                    headers=headers,
                )
            except httpx.TimeoutException as exc:
                if attempt < max_attempts - 1:
                    await asyncio.sleep(backoff_seconds * (attempt + 1))
                    attempt += 1
                    continue
                raise HTTPException(
                    status_code=504, detail="Upstream LLM timed out"
                ) from exc
            except httpx.HTTPError as exc:
                if attempt < max_attempts - 1:
                    await asyncio.sleep(backoff_seconds * (attempt + 1))
                    attempt += 1
                    continue
                raise HTTPException(
                    status_code=502, detail="Upstream LLM request failed"
                ) from exc

            if (
                response.status_code in TRANSIENT_STATUS_CODES
                and attempt < max_attempts - 1
            ):
                await asyncio.sleep(backoff_seconds * (attempt + 1))
                attempt += 1
                continue
            break

    content_type = (response.headers.get("content-type") or "").lower()
    body_text = response.text

    if "application/json" in content_type:
        try:
            result: Any = response.json()
        except ValueError:
            result = body_text
    elif not is_chat_completion and content_type.startswith("text/"):
        result = body_text
    else:
        body_snippet = body_text[:500]
        logger.error(
            "Upstream LLM returned unexpected content-type",
            extra={
                "status_code": response.status_code,
                "content_type": content_type,
                "body_snippet": body_snippet,
            },
        )
        raise HTTPException(
            status_code=response.status_code or 502,
            detail={
                "error": "Upstream returned non-JSON response",
                "status": response.status_code,
                "content_type": content_type or None,
                "body": body_snippet,
            },
        )

    if response.status_code >= 400:
        if isinstance(result, dict):
            detail: Any = result.get("error") or result
        elif isinstance(result, str):
            detail = result.strip() or "LLM error"
        else:
            detail = "LLM error"
        raise HTTPException(status_code=response.status_code, detail=detail)

    if is_chat_completion:
        if not isinstance(result, dict):
            raise HTTPException(
                status_code=502, detail="Unexpected response format from LLM"
            )

        choices = result.get("choices") or []
        if not choices:
            raise HTTPException(status_code=502, detail="LLM returned no choices")

        completion = choices[0]
        message = completion.get("message") or {}
        content = message.get("content")

        if not isinstance(content, str) or not content.strip():
            raise HTTPException(status_code=502, detail="LLM returned empty content")

        return ChatResponse(
            content=content,
            model=result.get("model"),
            raw=result,
        )

    generated_text = _extract_generated_text(result, prompt)
    if not generated_text or not generated_text.strip():
        raise HTTPException(status_code=502, detail="LLM returned empty content")

    if isinstance(result, dict):
        raw_payload: Dict[str, Any] = result
    elif isinstance(result, list):
        raw_payload = {"results": result}
    else:
        raw_payload = {"text": result}

    return ChatResponse(
        content=generated_text.strip(),
        model=model,
        raw=raw_payload,
    )


@app.post("/v1/chat/analyze", response_model=ChatAnalyzeResponse, tags=["chat"])
async def chat_analyze(request: ChatAnalyzeRequest) -> ChatAnalyzeResponse:
    try:
        messages = [message.dict() for message in request.messages]
        result = await chat_handler.process_message(
            messages=messages,
            context=request.context,
        )
        return ChatAnalyzeResponse(**result)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Chat processing failed: {exc}"
        ) from exc
