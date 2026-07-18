import pytest

from app.normalize.estimate_tokens import estimate_tokens


@pytest.mark.parametrize(
    ("text", "expected"),
    [("", 0), ("a", 1), ("abcd", 1), ("abcde", 2), ("x" * 10_000, 2_500)],
)
def test_estimate_tokens_uses_ceiling_chars_over_four(text: str, expected: int) -> None:
    assert estimate_tokens(text) == expected

