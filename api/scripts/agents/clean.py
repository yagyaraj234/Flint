from agents import Agent, function_tool

from _capture import MODEL, run_and_capture, submit


@function_tool
def get_order_status(order_id: str) -> str:
    return f"Order {order_id} shipped and will arrive on 2026-07-20."


def main() -> None:
    agent = Agent(
        name="Order status",
        model=MODEL,
        instructions=(
            "Use get_order_status once for the requested order, then give the customer "
            "a concise status update."
        ),
        tools=[get_order_status],
    )
    captured = run_and_capture(agent, "Where is order R0-123?")
    submit(captured, "Clean order status agent", "clean")


if __name__ == "__main__":
    main()
