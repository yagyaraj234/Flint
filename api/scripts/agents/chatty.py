from agents import Agent

from _capture import MODEL, run_and_capture, submit


PARAGRAPH = (
    "A neighborhood library extended its weekend hours after volunteers offered to "
    "staff the front desk. Attendance rose, families joined new reading groups, and "
    "the library decided to keep the schedule for the rest of the year."
)
# the same request, verbatim, five times — nothing new is learned after run 1
PROMPTS = [f"Summarize this paragraph in two sentences: {PARAGRAPH}"] * 5


def main() -> None:
    agent = Agent(
        name="Repetitive summarizer",
        model=MODEL,
        instructions="Summarize whatever paragraph the user supplies, every time you are asked.",
    )
    captured = run_and_capture(agent, PROMPTS, carry_history=False)
    submit(captured, "Chatty recursive summarizer", "chatty")


if __name__ == "__main__":
    main()
