"""Convert BFCL entries (question + expected tool calls) into generic trace JSON.

Usage:
    cd api && .venv/bin/python scripts/convert_bfcl.py [questions.jsonl answers.jsonl]

Defaults to the checked-in 5-entry sample under fixtures/bfcl/. Writes
fixtures/generated/bfcl-<id>.json, one generic-format trace per entry.
BFCL entries are task definitions — mostly clean, no usage data, tokens
estimated. Their demo job is proving the parser handles a published format.
"""

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
BFCL_DIR = REPO_ROOT / "fixtures" / "bfcl"
OUT_DIR = REPO_ROOT / "fixtures" / "generated"


def _load_jsonl(path: Path) -> dict[str, dict[str, Any]]:
    entries: dict[str, dict[str, Any]] = {}
    for line in path.read_text().splitlines():
        if line.strip():
            entry = json.loads(line)
            entries[entry["id"]] = entry
    return entries


def _first_ground_truth_args(answer: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    call = answer["ground_truth"][0]
    tool_name, params = next(iter(call.items()))
    # each param maps to a list of acceptable values; take the first non-empty one
    args = {key: next((v for v in values if v != ""), values[0]) for key, values in params.items()}
    return tool_name, args


def convert(question: dict[str, Any], answer: dict[str, Any]) -> dict[str, Any]:
    user_content = question["question"][0][0]["content"]
    tool_name, args = _first_ground_truth_args(answer)
    return {
        "workflow": f"bfcl:{question['id']}",
        "steps": [
            {
                "type": "llm",
                "name": "bfcl-question",
                "input": user_content,
                "output": f"Calling {tool_name}.",
            },
            {
                "type": "tool",
                "name": tool_name,
                "args": args,
                "output": "",
                "meta": {"functions_offered": [f["name"] for f in question.get("function", [])]},
            },
        ],
    }


def main() -> None:
    q_path = Path(sys.argv[1]) if len(sys.argv) > 2 else BFCL_DIR / "questions.sample.jsonl"
    a_path = Path(sys.argv[2]) if len(sys.argv) > 2 else BFCL_DIR / "answers.sample.jsonl"
    questions = _load_jsonl(q_path)
    answers = _load_jsonl(a_path)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for entry_id, question in questions.items():
        if entry_id not in answers:
            continue
        out = OUT_DIR / f"bfcl-{entry_id}.json"
        out.write_text(json.dumps(convert(question, answers[entry_id]), indent=2))
        print(out.relative_to(REPO_ROOT))


if __name__ == "__main__":
    main()
