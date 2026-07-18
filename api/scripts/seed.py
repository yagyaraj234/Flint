"""Post every fixture trace to the running API. Usage:

    cd api && .venv/bin/python scripts/seed.py [http://localhost:8000]

Skips fixtures/contract/ (that's a card example, not a trace).
Stage 5 extends this to run the BFCL converter first.
"""

import json
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "fixtures"


def main() -> None:
    base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    paths = sorted(p for p in FIXTURES.glob("**/*.json") if "contract" not in p.parts)
    if not paths:
        print(f"no fixtures found under {FIXTURES} — Track A's stage 1 creates them")
        return
    for path in paths:
        trace = json.loads(path.read_text())
        source = "bfcl" if "bfcl" in path.stem else "upload"
        resp = httpx.post(
            f"{base}/ingest",
            json={"source": source, "title": path.stem, "trace": trace},
            timeout=30,
        )
        resp.raise_for_status()
        print(f"{path.relative_to(REPO_ROOT)} -> /r/{resp.json()['slug']}")


if __name__ == "__main__":
    main()
