import os
import json
import argparse
from dotenv import load_dotenv
from nova_act import NovaAct

def parse_payload() -> dict:
    parser = argparse.ArgumentParser(description="Run Nova Act with booking payload from Sonic.")
    parser.add_argument(
        "--payload-json",
        dest="payload_json",
        default=None,
        help="JSON payload from backend (Sonic entities).",
    )
    args = parser.parse_args()

    raw_payload = args.payload_json or os.getenv("NOVA_ACTION_PAYLOAD")
    if not raw_payload:
        # Fallback for manual local test.
        return {
            "concert_name": "charlie puth",
            "concert_datetime": "tomorrow 8pm",
            "budget": "$120",
        }

    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid payload JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("Payload must be a JSON object.")
    return payload


def run_sighted_copilot(payload: dict) -> None:
    load_dotenv()
    api_key = os.getenv("NOVA_ACT_API_KEY")

    if not api_key:
        raise RuntimeError("NOVA_ACT_API_KEY is missing. Add it to .env first.")

    concert_name = (payload.get("concert_name") or "").strip()
    concert_datetime = (payload.get("concert_datetime") or "").strip()
    budget = (payload.get("budget") or payload.get("seat_preference") or "").strip()

    missing = [
        field_name
        for field_name, field_value in {
            "concert_name": concert_name,
            "concert_datetime": concert_datetime,
            "budget": budget,
        }.items()
        if not field_value
    ]
    if missing:
        raise RuntimeError(f"Payload missing required field(s): {', '.join(missing)}")

    print(
        f"\n🎙️ Sonic Payload Received: concert='{concert_name}', "
        f"datetime='{concert_datetime}', budget='{budget}'"
    )
    print("🚀 Activating SkyVoice Browsing Layer...")

    with NovaAct(
        starting_page=None,
        cdp_endpoint_url="http://127.0.0.1:9222",
        cdp_use_existing_page=True,
        nova_act_api_key=api_key,
        headless=False,
        chrome_channel="chrome",
        ignore_screen_dims_check=True,
        
    ) as nova:  
        
        goal_prompt = (
            f"Find tickets for '{concert_name}' at '{concert_datetime}'. "
            f"Budget limit is '{budget}'. "
            "1. Search and navigate to the matching event page. "
            "2. Open ticket options and find one that fits the budget. "
            "3. Click the matched ticket and verify the selection is highlighted. "
            "4. Stop after one valid option is selected."
        )
        
        try:
            print("\n🧠 AI: 'Reasoning through the layout...'")
            nova.act(goal_prompt, max_steps=15, observation_delay_ms=2500)
            
            # Final Visual Highlight
            nova.page.evaluate("""
                () => {
                    const badge = document.createElement('div');
                    badge.innerText = '👓 SKYVOICE SCOUT: TARGET IDENTIFIED';
                    badge.style = 'position:fixed; top:20px; right:20px; background:#FFD700; color:black; padding:20px; border-radius:10px; font-weight:bold; z-index:2147483647; font-family:sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,0.5);';
                    document.body.appendChild(badge);
                }
            """)
            print("\n✨ TASK COMPLETE. Highlighting the selection.")
            
        except Exception as e:
            print(f"\n⚠️ The AI hit a snag: {e}")

if __name__ == "__main__":
    incoming_payload = parse_payload()
    run_sighted_copilot(incoming_payload)