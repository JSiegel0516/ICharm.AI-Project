"""
Chat Handler - Orchestrates LLM with tool use and knowledge retrieval.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from ..tools.climate_tools import ClimateDataTools
from ..tools.knowledge_base import PlatformKnowledgeBase


class ClimateAnalysisChatHandler:
    """
    Main chat handler that:
    1. Receives user messages
    2. Retrieves relevant platform docs (RAG)
    3. Calls LLM with tool definitions
    4. Executes tools when LLM requests them
    5. Returns final response
    """

    def __init__(
        self,
        llm_client,
        data_api_url: str,
        knowledge_base: PlatformKnowledgeBase,
    ) -> None:
        self.llm_client = llm_client
        self.tools = ClimateDataTools(data_api_url)
        self.kb = knowledge_base
        self.system_prompt = self._build_system_prompt()
        self.backend = self._detect_backend(llm_client)

    @staticmethod
    def _detect_backend(llm_client) -> str:
        if hasattr(llm_client, "messages"):
            return "anthropic"
        if hasattr(llm_client, "chat"):
            return "openai"
        return "hf"

    def _build_system_prompt(self) -> str:
        """Base system prompt that sets up the assistant's role"""
        return """You are an expert climate data analyst assistant for the ICHARM Climate Data Platform.

**Your Role:**
You help users understand, analyze, and explore global climate datasets through an interactive 3D globe interface.

**Available Data:**
- **Precipitation**: CMORPH (8km, 30min, 1998-present), GPM IMERG, ERA5
- **Temperature**: ERA5 2m temperature (0.25 deg, hourly)
- **Vegetation**: MODIS NDVI (250m, 16-day), GIMMS NDVI (8km, 1981-present)
- **Hazards**: Global flood maps, landslide susceptibility
- Additional datasets for soil moisture, evapotranspiration, and more

**Your Capabilities:**
1. **Data Analysis**: Extract and analyze time series for any location globally
2. **Statistics**: Calculate trends, anomalies, percentiles, extremes
3. **Comparisons**: Compare multiple locations or time periods
4. **Platform Help**: Guide users through features and workflows
5. **Context Awareness**: Understand what the user is viewing on the globe

**Important Guidelines:**
- Always cite specific datasets, dates, and coordinates when presenting data
- Mention data resolution (spatial and temporal) and limitations
- Suggest visualizing results on the globe when relevant
- Provide statistical context (e.g., "above the 90th percentile")
- Be precise about units (mm, deg C, etc.)
- If data is unavailable, explain why and suggest alternatives
- When uncertain, use your tools to fetch real data rather than guessing

**Response Style:**
- Be concise but thorough
- Use bullet points for multi-part answers
- Include numbers and statistics when available
- Suggest follow-up actions (e.g., "Would you like to see this on the dashboard?")
- Be friendly and educational

You have access to tools for querying real data and platform documentation. Use them proactively."""

    async def process_message(
        self,
        messages: List[Dict[str, str]],
        context: Optional[Dict[str, Any]] = None,
        max_tool_rounds: int = 5,
    ) -> Dict[str, Any]:
        """
        Process a user message with tool use support.

        Args:
            messages: Conversation history [{"role": "user", "content": "..."}, ...]
            context: Optional globe context (current dataset, location, date)
            max_tool_rounds: Maximum tool call iterations to prevent infinite loops

        Returns:
            {
                "message": "Final response text",
                "tool_calls": [...],  # Tools that were executed
                "reasoning": "..."     # Internal reasoning if available
            }
        """
        full_messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt}
        ]

        context_msg = self._format_context(context)
        if context_msg:
            full_messages.append(
                {
                    "role": "system",
                    "content": f"**User's Current Context:**\n{context_msg}",
                }
            )

        user_question = messages[-1]["content"]

        if self.backend == "hf":
            auto_result = await self._auto_handle_data_request(user_question, context)
            if auto_result:
                return auto_result
        relevant_docs = self.kb.query(user_question, n_results=3)
        if relevant_docs:
            docs_text = "\n\n".join(
                f"**{doc['category'].upper()}:**\n{doc['text']}"
                for doc in relevant_docs
            )
            full_messages.append(
                {
                    "role": "system",
                    "content": f"**Relevant Platform Documentation:**\n{docs_text}",
                }
            )

        full_messages.extend(messages)

        tool_call_history: List[Dict[str, Any]] = []
        response: Dict[str, Any] = {}

        for round_num in range(max_tool_rounds):
            response = await self._call_llm_with_tools(full_messages)

            if response.get("tool_calls"):
                tool_results = []
                for tool_call in response["tool_calls"]:
                    tool_name = tool_call["name"]
                    tool_input = tool_call["input"]

                    result = await self.tools.execute_tool(tool_name, tool_input)

                    tool_results.append(
                        {
                            "tool_call_id": tool_call.get("id", f"call_{round_num}"),
                            "tool_name": tool_name,
                            "tool_input": tool_input,
                            "result": result,
                        }
                    )
                    tool_call_history.append(
                        {"name": tool_name, "input": tool_input, "output": result}
                    )

                full_messages.append(response["message"])

                full_messages.extend(
                    self._format_tool_results_for_backend(
                        tool_results, backend=self.backend
                    )
                )
                continue

            return {
                "message": response["message"]["content"],
                "tool_calls": tool_call_history,
                "reasoning": response.get("reasoning", ""),
            }

        return {
            "message": response["message"]["content"],
            "tool_calls": tool_call_history,
            "error": "Maximum tool call iterations reached",
        }

    async def _auto_handle_data_request(
        self, question: str, context: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        if not self._is_data_question(question):
            return None

        if not context or not context.get("currentDataset"):
            return {
                "message": "Which dataset should I use? Please select a dataset and try again.",
                "tool_calls": [],
            }

        dataset = context["currentDataset"]
        dataset_id = dataset.get("id")
        if not dataset_id:
            return {
                "message": "I need a dataset ID to fetch data. Please select a dataset and try again.",
                "tool_calls": [],
            }

        start_date, end_date = self._infer_date_range(question, context)
        if not start_date or not end_date:
            return {
                "message": "What date range should I use? Please specify a year or start/end dates.",
                "tool_calls": [],
            }

        location = context.get("selectedLocation")
        tool_calls = []

        if (
            location
            and isinstance(location.get("lat"), (int, float))
            and isinstance(location.get("lng"), (int, float))
        ):
            tool_input = {
                "dataset_id": dataset_id,
                "latitude": location["lat"],
                "longitude": location["lng"],
                "start_date": start_date,
                "end_date": end_date,
                "analysis_type": "raw",
            }
            result = await self.tools.execute_tool(
                "extract_point_timeseries", tool_input
            )
            tool_calls.append(
                {
                    "name": "extract_point_timeseries",
                    "input": tool_input,
                    "output": result,
                }
            )
        else:
            tool_input = {
                "dataset_id": dataset_id,
                "start_date": start_date,
                "end_date": end_date,
                "aggregation": "mean",
                "analysis_type": "raw",
            }
            result = await self.tools.execute_tool(
                "extract_dataset_timeseries", tool_input
            )
            tool_calls.append(
                {
                    "name": "extract_dataset_timeseries",
                    "input": tool_input,
                    "output": result,
                }
            )

        summary = result.get("summary", {})
        if summary.get("count", 0) == 0:
            return {
                "message": "I could not find any data points for that request.",
                "tool_calls": tool_calls,
            }

        dataset_name = dataset.get("name", "the selected dataset")
        max_value = summary.get("max")
        max_date = summary.get("max_date")

        if "highest" in question.lower() or "max" in question.lower():
            message = (
                f"For {dataset_name} ({dataset_id}), the highest value between "
                f"{start_date} and {end_date} is {max_value} on {max_date}."
            )
        else:
            message = (
                f"For {dataset_name} ({dataset_id}), the mean value between "
                f"{start_date} and {end_date} is {summary.get('mean')}."
            )

        return {
            "message": message,
            "tool_calls": tool_calls,
        }

    def _is_data_question(self, question: str) -> bool:
        lower = question.lower()
        if any(
            phrase in lower
            for phrase in [
                "how do i",
                "how to",
                "where do i",
                "help",
                "export",
                "dashboard",
                "feature",
                "ui",
                "navigate",
            ]
        ):
            return False

        return any(
            term in lower
            for term in [
                "temperature",
                "precipitation",
                "rain",
                "ndvi",
                "trend",
                "anomaly",
                "average",
                "mean",
                "highest",
                "lowest",
                "max",
                "min",
                "compare",
            ]
        )

    def _infer_date_range(
        self, question: str, context: Optional[Dict[str, Any]]
    ) -> Tuple[Optional[str], Optional[str]]:
        import re

        match = re.search(r"(19|20)\d{2}", question)
        if match:
            year = match.group(0)
            return f"{year}-01-01", f"{year}-12-31"

        if context and context.get("selectedDate"):
            selected_date = context["selectedDate"]
            return selected_date, selected_date

        return None, None

    def _format_tool_results_for_backend(
        self, tool_results: List[Dict[str, Any]], backend: str
    ) -> List[Dict[str, Any]]:
        if backend == "anthropic":
            return [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tr["tool_call_id"],
                            "content": json.dumps(tr["result"], indent=2),
                        }
                        for tr in tool_results
                    ],
                }
            ]

        if backend == "openai":
            messages: List[Dict[str, Any]] = []
            for tr in tool_results:
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tr["tool_call_id"],
                        "content": json.dumps(tr["result"]),
                    }
                )
            return messages

        return [
            {
                "role": "user",
                "content": (
                    "**Tool Results:**\n```json\n"
                    f"{json.dumps(tool_results, indent=2)}\n```"
                ),
            }
        ]

    async def _call_llm_with_tools(
        self, messages: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Call the LLM with tool definitions.
        Adapt this to your specific LLM client (Anthropic, OpenAI, HuggingFace, etc.)
        """
        if self.backend == "anthropic":
            response = await self.llm_client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                messages=messages[1:],
                system=messages[0]["content"],
                tools=self.tools.tool_definitions,
            )

            if response.stop_reason == "tool_use":
                tool_calls = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_calls.append(
                            {"id": block.id, "name": block.name, "input": block.input}
                        )

                return {
                    "message": {"role": "assistant", "content": response.content},
                    "tool_calls": tool_calls,
                }

            text = "".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            return {"message": {"role": "assistant", "content": text}}

        if self.backend == "openai":
            response = await self.llm_client.chat.completions.create(
                model="gpt-4-turbo-preview",
                messages=messages,
                tools=[
                    {
                        "type": "function",
                        "function": {
                            "name": tool["name"],
                            "description": tool["description"],
                            "parameters": tool["input_schema"],
                        },
                    }
                    for tool in self.tools.tool_definitions
                ],
                tool_choice="auto",
            )

            message = response.choices[0].message

            if message.tool_calls:
                return {
                    "message": {"role": "assistant", "content": message.content or ""},
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "name": tc.function.name,
                            "input": json.loads(tc.function.arguments),
                        }
                        for tc in message.tool_calls
                    ],
                }

            return {"message": {"role": "assistant", "content": message.content or ""}}

        response = await self.llm_client.generate(messages)
        return {"message": {"role": "assistant", "content": response}}

    def _format_context(self, context: Optional[Dict[str, Any]]) -> Optional[str]:
        """Format globe context into readable text for system message"""
        if not context:
            return None

        parts = []

        if context.get("currentDataset"):
            dataset = context["currentDataset"]
            parts.append(
                "- Currently viewing dataset: "
                f"**{dataset.get('name', 'Unknown')}** "
                f"(ID: {dataset.get('id', 'N/A')})"
            )

        if context.get("selectedLocation"):
            loc = context["selectedLocation"]
            lat = loc.get("lat")
            lng = loc.get("lng")
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                parts.append(
                    "- Selected location: "
                    f"**{loc.get('name', 'Unknown location')}** "
                    f"at coordinates ({lat:.4f} deg, {lng:.4f} deg)"
                )
            else:
                parts.append(
                    f"- Selected location: **{loc.get('name', 'Unknown location')}**"
                )

        if context.get("selectedDate"):
            parts.append(f"- Viewing date: **{context['selectedDate']}**")

        if context.get("timeRange"):
            time_range = context["timeRange"]
            parts.append(
                f"- Time range: {time_range.get('start')} to {time_range.get('end')}"
            )

        if context.get("visibleRegion"):
            region = context["visibleRegion"]
            parts.append(f"- Visible region: {region.get('name', 'Custom bounds')}")

        return "\n".join(parts) if parts else None
