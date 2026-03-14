import os
import time
from dotenv import load_dotenv
from nova_act import NovaAct

def run_sighted_copilot() -> None:
    load_dotenv()
    api_key = os.getenv("NOVA_ACT_API_KEY")

    if not api_key:
        raise RuntimeError("NOVA_ACT_API_KEY is missing. Add it to .env first.")

    # --- SIMULATED SONIC BACKEND OUTPUT ---
    # These would come from your existing Bedrock Sonic client
    user_intent = "charlie puth"
    user_budget = "minimum_price"
    
    print(f"\n🎙️ Sonic Intent Received: '{user_intent}' under ${user_budget}")
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
        
        # ONE POWERFUL PROMPT:
        # We use the Sonic variables directly here.
        # Since Act has built-in vision, it can handle the 'Aisle' detection itself.
        goal_prompt = (
            f"I need to find a {user_intent} for under ${user_budget}. "
            "1. Scroll the right-hand ticket list carefully. "
            "2. Identify a ticket with an 'Aisle' label that fits the budget. "
            "3. CLICK the ticket in the list. "
            "4. Verify the map highlights it. Then HOVER to confirm. "
            "If no 'Aisle' label is visible in the list, use the map to find a dot on the edge of a section."
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

        input("\n👉 Press [ENTER] to detach.")

if __name__ == "__main__":
    run_sighted_copilot()