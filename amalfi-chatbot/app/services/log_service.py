import csv
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ðŸ“‚ Archive Settings
REPO_ROOT = Path(__file__).resolve().parents[3]
RUNTIME_ROOT = Path(os.getenv("RUNTIME_PATH", REPO_ROOT / "amalfi-system" / "runtime"))
LOG_DIR = Path(os.getenv("CHATBOT_LOG_DIR", RUNTIME_ROOT / "chatbot" / "logs"))
LOG_FILE = Path(os.getenv("CHATBOT_LOG_FILE", LOG_DIR / "chat_archive.csv"))
PH_TIMEZONE = timezone(timedelta(hours=8))

def initialize_logger():
    """Ensure our CSV archive is ready with headers."""
    if not LOG_DIR.exists():
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        print(f"ðŸ“‚ Created log directory: {LOG_DIR}")
        
    if not LOG_FILE.exists():
        with open(LOG_FILE, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(["Timestamp", "Sender ID", "User Message", "Bot Answer", "Intent", "Is Urgent"])
        print(f"ðŸ“œ Created new CSV archive: {LOG_FILE}")

def archive_chat_turn(sender_id: str, message: str, ai_response: str, intent: str = "general", is_urgent: bool = False):
    """Appends a new conversation turn to the local CSV archive."""
    try:
        initialize_logger()
        timestamp = datetime.now(PH_TIMEZONE).strftime("%Y-%m-%d %I:%M:%S %p PHT")
        
        # Clean line breaks for CSV readability (replaces \n with a space)
        clean_msg = message.replace("\n", " ") if message else "[Attachment]"
        clean_resp = ai_response.replace("\n", " ") if ai_response else "..."

        with open(LOG_FILE, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([timestamp, sender_id, clean_msg, clean_resp, intent, "URGENT" if is_urgent else "Normal"])
            
    except Exception as e:
        print(f"âš ï¸ Failed to archive chat turn: {e}")
