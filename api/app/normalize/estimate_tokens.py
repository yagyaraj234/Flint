"""Small, dependency-free token count estimator."""

import math


def estimate_tokens(text: str) -> int:
    """Estimate token count using the project-wide four characters per token rule."""

    return math.ceil(len(text) / 4)

