"""Stage 2 acceptance: fixtures through the full normalize -> redact -> analyze -> score chain."""

import json
from pathlib import Path

from app.analyze.cost import analyze_cost
from app.analyze.roast import analyze_roast
from app.analyze.score import score, tier
from app.normalize import openai_agents
from app.normalize.redact import redact_trace
from app.types import CostReport, Finding

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
# Fixtures use gpt-4.1-mini; PRICING ships zeroed until the venue, so inject here.
TEST_PRICING = {"gpt-4.1-mini": {"in_per_m": 0.4, "out_per_m": 1.6}}


def run_chain(name: str) -> tuple[list[Finding], CostReport, int, str]:
    raw = json.loads((FIXTURES / f"{name}.json").read_text())
    trace = openai_agents.parse(raw)
    redacted, hits = redact_trace(trace)
    cost_findings, report = analyze_cost(redacted, TEST_PRICING)
    findings = [*analyze_roast(redacted, hits), *cost_findings]
    value = score(findings)
    return findings, report, value, tier(value)


def test_leaked_key_lands_charcoal() -> None:
    findings, _, value, tier_name = run_chain("leaked-key")
    assert "leaked-secret" in {f.rule for f in findings}
    assert tier_name == "Charcoal", f"score {value}, findings {[f.rule for f in findings]}"


def test_loopy_produces_tool_loop() -> None:
    findings, _, _, _ = run_chain("loopy")
    assert "tool-loop" in {f.rule for f in findings}


def test_bloated_prompt_produces_repeated_bloat_with_waste() -> None:
    findings, report, _, _ = run_chain("bloated-prompt")
    bloat = [f for f in findings if f.rule == "repeated-bloat"]
    assert bloat and (bloat[0].est_waste_usd or 0) > 0
    assert report.waste_usd > 0


def test_clean_scores_rare() -> None:
    findings, _, value, _ = run_chain("clean")
    assert value >= 90, f"score {value}, findings {[f.rule for f in findings]}"
