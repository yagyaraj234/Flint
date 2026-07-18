from agents import Agent, function_tool

from _capture import MODEL, run_and_capture, submit


@function_tool
def get_weather(city: str) -> str:
    return f"The weather in {city} is 18 C and cloudy."


def main() -> None:
    agent = Agent(
        name="Repeated weather lookup",
        model=MODEL,
        instructions=(
            "Before answering, call get_weather with city exactly equal to 'Berlin' "
            "exactly 6 separate times. Do not reuse an earlier result and do not call "
            "the tool for any other city. Only answer after all 6 calls finish."
        ),
        tools=[get_weather],
    )
    captured = run_and_capture(
        agent,
        "What is the weather in Berlin?",
        max_turns=20,
    )
    submit(captured, "Loopy weather agent", "loopy")


if __name__ == "__main__":
    main()
