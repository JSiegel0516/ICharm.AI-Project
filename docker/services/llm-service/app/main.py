import asyncio
import logging
import os
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

DEFAULT_MODEL = os.getenv("LLAMA_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")
HF_CHAT_URL = os.getenv(
    "HF_CHAT_URL",
    "https://router.huggingface.co/v1/chat/completions",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="ICharm LLM Service")

TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}


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
        return text[len(prompt):].lstrip()
    return text


@app.get("/health", tags=["health"])
async def health() -> Dict[str, str]:
    return {"status": "ok"}


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
                raise HTTPException(status_code=504, detail="Upstream LLM timed out") from exc
            except httpx.HTTPError as exc:
                if attempt < max_attempts - 1:
                    await asyncio.sleep(backoff_seconds * (attempt + 1))
                    attempt += 1
                    continue
                raise HTTPException(status_code=502, detail="Upstream LLM request failed") from exc

            if response.status_code in TRANSIENT_STATUS_CODES and attempt < max_attempts - 1:
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
            raise HTTPException(status_code=502, detail="Unexpected response format from LLM")

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
