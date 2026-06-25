import os
import httpx
import asyncio
from dotenv import load_dotenv

# Load credentials
load_dotenv()
RAW_TOKEN = os.getenv("FB_PAGE_ACCESS_TOKEN")
# ðŸ’Ž Surgical Cleanup: Removes any 'Ghost' characters or spaces
FB_PAGE_ACCESS_TOKEN = RAW_TOKEN.strip().replace("\n", "").replace(" ", "") if RAW_TOKEN else None
APP_WEBSITE_URL = os.getenv("APP_WEBSITE_URL", "https://www.amalfi-resort-zambales.online")

async def setup_persistent_menu():
    """
    ðŸ’Ž Sets up the 'Persistent Menu' in Facebook Messenger.
    This creates the permanent button on the side that always takes guests 'Home'.
    """
    if not FB_PAGE_ACCESS_TOKEN:
        print("âŒ FAILED: FB_PAGE_ACCESS_TOKEN is missing or empty in .env!")
        return

    url = f"https://graph.facebook.com/v19.0/me/messenger_profile?access_token={FB_PAGE_ACCESS_TOKEN}"
    
    payload = {
        "get_started": {"payload": "GET_STARTED"},
        "persistent_menu": [
            {
                "locale": "default",
                "composer_input_disabled": False,
                "call_to_actions": [
                    {
                        "type": "postback",
                        "title": "ðŸ  Main Menu",
                        "payload": "MAIN_MENU"
                    },
                    {
                        "type": "postback",
                        "title": "ðŸ“… Booking Inquiry",
                        "payload": "BOOKING_INQUIRY"
                    }
                ]
            }
        ],
        "whitelisted_domains": [
            APP_WEBSITE_URL.replace("www.", ""),
            APP_WEBSITE_URL if "www." in APP_WEBSITE_URL else APP_WEBSITE_URL.replace("https://", "https://www.")
        ]
    }
    
    print("ðŸ™ï¸  Manifesting Persistent Menu...")
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        if response.status_code == 200:
            print("âœ… SUCCESS: The 'Main Menu' button is now permanently anchored for all guests! ðŸï¸")
        else:
            print(f"âŒ FAILED: {response.text}")

if __name__ == "__main__":
    asyncio.run(setup_persistent_menu())
