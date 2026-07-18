"""Convert ai4privacy/pii-masking-300k samples into generic traces, and score
our PII/secret detectors against the dataset's ground-truth annotations.

Usage:
    cd api && .venv/bin/python scripts/convert_pii.py [--post] [N]

Fetches N English samples (default 10) from the HF datasets-server (public, no
auth), writes fixtures/generated/pii-<id>.json, prints detector recall on the
classes we actually claim to cover (EMAIL, TEL). --post ingests each trace into
the running API. The dataset's PII is synthetic, so storing/showing it is safe.
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
    "?dataset=ai4privacy%2Fpii-masking-300k&config=default&split=validation"
)

# the classes our analyzers claim to cover (roast.py: pii-in-prompt)
COVERED_LABELS = {"EMAIL", "TEL"}

sys.path.insert(0, str(REPO_ROOT / "api"))
from app.analyze.roast import _EMAIL_RE, _PHONE_RE  # noqa: E402


def fetch_samples(want: int) -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    offset = 0
    while len(samples) < want and offset < 1000:
        resp = httpx.get(f"{ROWS_URL}&offset={offset}&length=100", timeout=30)
        resp.raise_for_status()
        for item in resp.json()["rows"]:
            row = item["row"]
            if row["language"] != "English":
                continue
            mask = row["privacy_mask"]
            row["privacy_mask"] = json.loads(mask) if isinstance(mask, str) else mask
            # prefer samples exercising the classes we cover
            if any(m["label"] in COVERED_LABELS for m in row["privacy_mask"]):
                samples.append(row)
            if len(samples) >= want:
                break
        offset += 100
    return samples


def to_trace(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "workflow": f"pii:{row['id']}",
        "steps": [
            {
                "type": "llm",
                "name": "pii-sample",
                "input": row["source_text"],
                "output": "",
                "meta": {"dataset": "ai4privacy/pii-masking-300k", "language": row["language"]},
            }
        ],
    }


def detector_hits(text: str) -> int:
    return len(_EMAIL_RE.findall(text)) + len(_PHONE_RE.findall(text))


def main() -> None:
    post = "--post" in sys.argv
    counts = [a for a in sys.argv[1:] if a.isdigit()]
    want = int(counts[0]) if counts else 10

    samples = fetch_samples(want)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    total_truth = 0
    total_found = 0
    for row in samples:
        truth = [
            m
            for m in row["privacy_mask"]
            if m["label"] in COVERED_LABELS
            # skip annotation artifacts like value "N/A" (no digits, no @)
            and (any(c.isdigit() for c in m["value"]) or "@" in m["value"])
        ]
        found = sum(
            1
            for m in truth
            if _EMAIL_RE.search(m["value"]) or _PHONE_RE.search(m["value"])
        )
        total_truth += len(truth)
        total_found += found

        out = OUT_DIR / f"pii-{row['id']}.json"
        out.write_text(json.dumps(to_trace(row), indent=2))
        line = f"{out.name}  truth(EMAIL/TEL)={len(truth)} detected={found}"
        if post:
            resp = httpx.post(
                f"{API}/ingest",
                json={
                    "source": "upload",
                    "title": f"pii-masking {row['id']}",
                    "format": "generic",
                    "trace": to_trace(row),
                },
                timeout=30,
            )
            resp.raise_for_status()
            line += f"  -> /r/{resp.json()['slug']}"
        print(line)

    if total_truth:
        print(
            f"\ndetector recall on covered classes (EMAIL, TEL): "
            f"{total_found}/{total_truth} = {total_found / total_truth:.0%}"
        )
    print("note: USERNAME, ADDRESS, NAME etc. are out of scope for the pii-in-prompt rule")


if __name__ == "__main__":
    main()
