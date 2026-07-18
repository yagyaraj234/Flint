"""Convert nebius/SWE-agent-trajectories (HF, public, 80k rows) into generic traces.

Usage:
    cd api && .venv/bin/python scripts/convert_swe.py [--post] [N]

Real multi-step SWE-agent runs solving GitHub issues: chat-format steps where
'ai' messages carry a fenced ```command``` action and the following 'user'
message is the observation. Mapping:
- ai step   -> llm span (input = previous message text, output = ai text)
- command   -> tool span (name = first token, input = command, output = observation)
- exit_status other than submitted -> final span meta {"status": "error"}
Texts are truncated to keep traces postable; tokens are estimated and labeled.
"""

import json
import re
import sys
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "fixtures" / "generated"
API = "http://localhost:8000"
ROWS_URL = (
    "https://datasets-server.huggingface.co/rows"
    "?dataset=nebius%2FSWE-agent-trajectories&config=default&split=train"
)

MAX_TEXT = 4_000  # chars per span text; keeps 90-step traces postable
COMMAND_RE = re.compile(r"```\n?(.*?)\n?```", re.DOTALL)


def _clip(text: str) -> str:
    return text[:MAX_TEXT]


def to_trace(row: dict[str, Any]) -> dict[str, Any]:
    traj = row["trajectory"]
    traj = json.loads(traj) if isinstance(traj, str) else traj
    steps: list[dict[str, Any]] = []
    prev_text = ""
    for msg in traj:
        text = msg.get("text") or ""
        if msg.get("role") == "ai":
            steps.append(
                {
                    "type": "llm",
                    "name": row["model_name"],
                    "model": row["model_name"],
                    "input": _clip(prev_text),
                    "output": _clip(text),
                }
            )
            match = COMMAND_RE.search(text)
            if match:
                command = match.group(1).strip()
                steps.append(
                    {
                        "type": "tool",
                        "name": command.split()[0] if command.split() else "shell",
                        "input": _clip(command),
                        "output": "",
                    }
                )
        prev_text = text

    exit_status = (row.get("exit_status") or "").strip()
    if steps and not exit_status.startswith("submitted"):
        steps[-1]["meta"] = {"status": "error", "exit_status": exit_status}
    return {
        "workflow": f"swe-agent:{row['instance_id']}",
        "steps": steps,
        "meta": {
            "dataset": "nebius/SWE-agent-trajectories",
            "exit_status": exit_status,
            "resolved": row.get("target"),
        },
    }


def fetch_rows(want: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while len(rows) < want and offset < 500:
        resp = httpx.get(f"{ROWS_URL}&offset={offset}&length=20", timeout=60)
        resp.raise_for_status()
        for item in resp.json()["rows"]:
            row = item["row"]
            traj = row["trajectory"]
            traj = json.loads(traj) if isinstance(traj, str) else traj
            if 10 <= len(traj) <= 80:  # skip trivial and monster runs
                row["trajectory"] = traj
                rows.append(row)
            if len(rows) >= want:
                break
        offset += 20
    return rows


def main() -> None:
    post = "--post" in sys.argv
    counts = [a for a in sys.argv[1:] if a.isdigit()]
    want = int(counts[0]) if counts else 5

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for index, row in enumerate(fetch_rows(want)):
        trace = to_trace(row)
        model_slug = re.sub(r"[^A-Za-z0-9.-]+", "-", row["model_name"])
        out = OUT_DIR / f"swe-{row['instance_id']}-{model_slug}-{index}.json"
        out.write_text(json.dumps(trace, indent=2))
        line = f"{out.name}  steps={len(trace['steps'])} exit={trace['meta']['exit_status']!r}"
        if post:
            resp = httpx.post(
                f"{API}/ingest",
                json={
                    "source": "upload",
                    "title": f"swe-agent {row['instance_id']}",
                    "format": "generic",
                    "trace": trace,
                },
                timeout=60,
            )
            resp.raise_for_status()
            line += f"  -> /r/{resp.json()['slug']}"
        print(line)


if __name__ == "__main__":
    main()
