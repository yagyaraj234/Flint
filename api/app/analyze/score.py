"""Finding score and tier calculation."""

from collections.abc import Sequence

from app.types import Finding

_DEDUCTIONS = {1: 5, 2: 12, 3: 25}


def score(findings: Sequence[Finding]) -> int:
    """Score findings from 100, applying the security multiplier."""

    deduction = 0
    for finding in findings:
        finding_deduction = _DEDUCTIONS[finding.severity]
        if finding.category == "security":
            finding_deduction = round(finding_deduction * 1.5)
        deduction += finding_deduction
    return max(0, 100 - deduction)


def tier(score: int) -> str:
    """Map a numeric score to its roast tier."""

    if score >= 90:
        return "Rare"
    if score >= 65:
        return "Medium"
    if score >= 35:
        return "Well Done"
    return "Charcoal"
