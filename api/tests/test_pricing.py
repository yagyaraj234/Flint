from app.analyze.pricing import FALLBACK_PRICE, PRICING, RUNS_PER_DAY


def test_venue_pricing_starts_at_intentional_zeroes() -> None:
    assert PRICING == {}
    assert FALLBACK_PRICE == {"in_per_m": 0.0, "out_per_m": 0.0}
    assert RUNS_PER_DAY == 1000
