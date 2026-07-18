from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Sequence

import httpx
from agents import Agent, Runner
from agents.tracing import TracingProcessor, set_trace_processors, trace


API_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(API_DIR))

from app.config import get_settings


settings = get_settings()
os.environ["OPENAI_API_KEY"] = settings.openai_api_key
MODEL = settings.roast_model


class CaptureProcessor(TracingProcessor):
    def __init__(self) -> None:
        self.traces: list[dict[str, Any]] = []
        self.spans: list[dict[str, Any]] = []

    def on_trace_start(self, trace: Any) -> None:
        pass

    def on_trace_end(self, trace: Any) -> None:
        exported = trace.export()
        if exported is not None:
            self.traces.append(exported)

    def on_span_start(self, span: Any) -> None:
        pass

    def on_span_end(self, span: Any) -> None:
        exported = span.export()
        if exported is None:
            return
        # The SDK exports response spans as only {response_id, usage}: message
        # content never leaves memory. Re-attach input/output/model from the
        # in-memory span_data so the analyzers have text to work with.
        span_data = exported.get("span_data")
        if isinstance(span_data, dict) and span_data.get("type") == "response":
            data = span.span_data
            response = getattr(data, "response", None)
            messages: list[Any] = []
            instructions = getattr(response, "instructions", None)
            if instructions:
                messages.append({"role": "system", "content": instructions})
            raw_input = getattr(data, "input", None)
            if isinstance(raw_input, str):
                messages.append({"role": "user", "content": raw_input})
            elif raw_input is not None:
                messages.extend(raw_input)
            span_data["input"] = messages
            if response is not None:
                span_data["model"] = getattr(response, "model", None)
                output_text = getattr(response, "output_text", "")
                span_data["output"] = output_text or [
                    getattr(item, "model_dump", lambda: str(item))()
                    for item in getattr(response, "output", [])
                ]
        self.spans.append(exported)

    def shutdown(self) -> None:
        pass

    def force_flush(self) -> None:
        pass


def run_and_capture(
    agent: Agent[Any],
    prompt: str | Sequence[str],
    max_turns: int = 12,
    carry_history: bool = True,
) -> dict[str, Any]:
    processor = CaptureProcessor()
    set_trace_processors([processor])
    prompts = [prompt] if isinstance(prompt, str) else list(prompt)
    if not prompts:
        raise ValueError("At least one prompt is required")

    history: list[Any] = []
    with trace(agent.name):
        for current_prompt in prompts:
            run_input: str | list[Any]
            if history:
                run_input = [
                    *history,
                    {"role": "user", "content": current_prompt},
                ]
            else:
                run_input = current_prompt
            result = Runner.run_sync(agent, run_input, max_turns=max_turns)
            if carry_history:
                history = result.to_input_list()

    if not processor.traces:
        raise RuntimeError("The tracing processor did not receive a trace")

    trace_export = processor.traces[-1]
    trace_data = {
        "trace": {
            "id": trace_export["id"],
            "workflow_name": trace_export["workflow_name"],
            "spans": processor.spans,
        }
    }
    # SDK objects can leak into span payloads; force everything JSON-safe.
    return json.loads(json.dumps(trace_data, default=str))


def _dump(trace_data: dict[str, Any], dump_name: str) -> Path:
    generated_dir = REPO_DIR / "fixtures" / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    output_path = generated_dir / f"{dump_name}.json"
    output_path.write_text(json.dumps(trace_data, indent=2) + "\n", encoding="utf-8")
    return output_path


def submit(trace: dict[str, Any], title: str, dump_name: str) -> None:
    if "--dump" in sys.argv:
        print(_dump(trace, dump_name))
        return

    try:
        response = httpx.post(
            "http://localhost:8000/ingest",
            json={
                "source": "live",
                "title": title,
                "format": "openai-agents",
                "trace": trace,
            },
            timeout=30.0,
        )
        response.raise_for_status()
        slug = response.json()["slug"]
        print(f"http://localhost:3000/r/{slug}")
    except Exception:
        print(_dump(trace, dump_name))
