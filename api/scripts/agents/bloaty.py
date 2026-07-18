from agents import Agent

from _capture import MODEL, run_and_capture, submit


FILLER_SENTENCE = (
    "Retain every operational detail, acknowledge all context, and answer accurately. "
)
BLOATED_CONTEXT = (FILLER_SENTENCE * 200)[:10_240]
INSTRUCTIONS = (
    BLOATED_CONTEXT
    + "\nTask: answer each small arithmetic request with only the numeric result."
)
PROMPTS = [
    "What is 1 + 1?",
    "What is 2 + 2?",
    "What is 3 + 3?",
    "What is 4 + 4?",
    "What is 5 + 5?",
    "What is 6 + 6?",
]


def main() -> None:
    agent = Agent(
        name="Bloated arithmetic assistant",
        model=MODEL,
        instructions=INSTRUCTIONS,
    )
    # fresh context each turn: every llm span repeats the identical 10KB prefix
    captured = run_and_capture(agent, PROMPTS, carry_history=False)
    submit(captured, "Bloated prompt agent", "bloaty")


if __name__ == "__main__":
    main()
