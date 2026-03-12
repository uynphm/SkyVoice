import os
import time

from dotenv import load_dotenv
from nova_act import NovaAct


def run_delta_flight_action() -> None:
    load_dotenv()

    api_key = os.getenv("NOVA_ACT_API_KEY")
    if not api_key:
        raise RuntimeError(
            "NOVA_ACT_API_KEY is missing. Add it to backend/nova-act-service/.env first."
        )

    with NovaAct(
        starting_page="https://www.google.com/travel/flights",
        nova_act_api_key=api_key,
        headless=False,
    ) as nova:  
        def run_step(prompt: str, required: bool = True, max_steps: int = 30) -> None:
            try:
                nova.act(prompt, max_steps=max_steps)
            except Exception as exc:
                if "not accessible" in str(exc):
                    print("Page blocked, retrying...")
                    nova.act("Reload the page and try again", max_steps=10)
                    return
                if required:
                    raise
                print(f"[WARN] Non-blocking step failed: {exc}")

        run_step(
            "Wait for google.com/travel/flights to finish loading. "
            "If there is a cookie banner or popup, close or accept it."
        )
        run_step("Set trip type to One Way.")
        run_step(
            "Fill the From field with Seattle and select the Seattle airport option."
        )
        run_step(
            "Fill the To field with San Francisco and select the San Francisco airport option, after that click out"
        )
        run_step("Set departure date to March 11, 2026.")
        run_step(
            "Ensure passenger count is exactly 1. "
            "If it is already 1, do nothing and return immediately. "
            "Do not open advanced search and do not scroll.",
            required=False,
            max_steps=8,
        )
        time.sleep(5)
        run_step("Click Search to view flights.")
        run_step(
            "On results page, sort by price from low to high. "
            "Choose the cheapest available ticket."
        )
        run_step(
            "Continue through the booking flow until the seat map is visible. "
            "Open seat map if needed."
        )
        run_step(
            "On the seat map, pick one available window seat with the lowest extra fee. "
            "Confirm the seat selection, but do not complete payment."
        )


if __name__ == "__main__":
    run_delta_flight_action()