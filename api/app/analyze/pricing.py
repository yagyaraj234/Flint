"""Model pricing used by the cost analyzer."""

# Fill from the OpenAI pricing page AT THE VENUE. Zeros are intentional:
# the build should nag you until real numbers go in.
PRICING: dict[str, dict[str, float]] = {
    # 'model-name': {'in_per_m': 0, 'out_per_m': 0},
}
FALLBACK_PRICE = {"in_per_m": 0.0, "out_per_m": 0.0}
RUNS_PER_DAY = 1000  # printed on the card as the projection assumption
