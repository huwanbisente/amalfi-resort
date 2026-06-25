from fastapi import APIRouter, Request, Response, BackgroundTasks
import os
import asyncio
import httpx
import json
import re
import csv
from datetime import datetime, date
from app.services.llm_service import get_ai_response, verify_receipt_with_vision
from app.services.messenger_service import send_message, send_image, send_button_template, send_generic_template, send_generic_carousel, send_quick_replies, mark_seen, typing_on, typing_off
from app.services.log_service import archive_chat_turn, LOG_FILE
from app.services.state_service import create_chatbot_alert, get_daily_ai_usage, increment_daily_ai_usage, get_conversation_state, set_conversation_pause, update_conversation_metadata
from datetime import datetime, date, timezone, timedelta

router = APIRouter()

# â”€â”€â”€ ðŸ§  STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
USER_MESSAGE_COUNTS = {}
USER_COOLDOWN       = {}
CONVERSATION_MEMORY = {}   # {sender_id: [{"role": "user/assistant", "content": "..."}]}
MAX_MESSAGES_PER_SESSION = 15
NORMAL_AI_DAILY_LIMIT = int(os.getenv("NORMAL_AI_DAILY_LIMIT", "10"))
BOOKING_AI_DAILY_LIMIT = int(os.getenv("BOOKING_AI_DAILY_LIMIT", "15"))
LOW_QUALITY_AI_DAILY_LIMIT = int(os.getenv("LOW_QUALITY_AI_DAILY_LIMIT", "4"))
DAILY_AI_MESSAGE_COUNTS = {}  # {(sender_id, yyyy-mm-dd): count}
MAX_HISTORY_TURNS        = 6   # last 6 exchanges kept in memory
MIN_COOLDOWN_SECONDS     = 0.5
DEDUP_WINDOW             = {}  # {sender_id: (message, timestamp)} â€” prevents double-sends
RECENT_MESSENGER_DELIVERIES = {}  # {delivery_key: timestamp} â€” prevents Meta webhook retry duplicates
TEXT_DEDUP_WINDOW_SECONDS = float(os.getenv("TEXT_DEDUP_WINDOW_SECONDS", "12"))
DELIVERY_DEDUP_TTL_SECONDS = float(os.getenv("DELIVERY_DEDUP_TTL_SECONDS", "600"))

FB_VERIFY_TOKEN      = os.getenv("FB_VERIFY_TOKEN", "amalfi_secure_token")
APP_PUBLIC_URL       = os.getenv("APP_PUBLIC_URL", "http://localhost:8001")
HUB_URL              = os.getenv("HUB_URL", "http://192.168.1.101:3001")
BOOKING_URL          = "https://www.amalfi-resort-zambales.online"
FB_PAGE_ID           = os.getenv("FB_PAGE_ID", "").strip()
FB_PAGE_ACCESS_TOKEN = os.getenv("FB_PAGE_ACCESS_TOKEN", "")
INTERNAL_AUTH_TOKEN  = os.getenv("INTERNAL_AUTH_TOKEN", "amalfi_internal_key_2026")
PH_TIMEZONE          = timezone(timedelta(hours=8))
AI_TRIAGE_ENABLED    = os.getenv("AI_TRIAGE_ENABLED", "true").lower() == "true"
AI_TRIAGE_MIN_CHARS  = int(os.getenv("AI_TRIAGE_MIN_CHARS", "18"))
AI_TRIAGE_MODEL      = os.getenv("AI_TRIAGE_MODEL", "gpt-4o-mini")
BOT_AUTO_RESUME_MINUTES = int(os.getenv("BOT_AUTO_RESUME_MINUTES", "30"))
HANDOFF_PAUSE_HOURS = max(BOT_AUTO_RESUME_MINUTES / 60, 0.05)

TRIAGE_CATEGORIES = {
    "HOT_BOOKING_LEAD",
    "CONFIRMED_BOOKING",
    "PAYMENT_SENT",
    "COMPLAINT",
    "REBOOKING_OR_CANCELLATION",
    "NEEDS_HUMAN",
    "MANUAL_ACTIVE",
    "LOW_PRIORITY_FAQ",
    "SPAM_OR_NONSENSE",
}
TRIAGE_PRIORITIES = {"low", "normal", "medium", "high", "critical"}

# â”€â”€â”€ ðŸ“‚ RESOURCE LOADERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_BASE = os.path.join(os.path.dirname(__file__), '..', '..')

async def load_knowledge_base() -> dict:
    """Load resort knowledge from the Hub, the single source of truth."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{HUB_URL}/api/v1/public/knowledge")
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"[KNOWLEDGE] Hub knowledge load failed; no local KB fallback will be used: {e}")

    return {}

async def load_menu_responses() -> dict:
    """Load the editable message templates (wording, structure, quick-reply labels)."""
    r_path = os.path.join(_BASE, 'responses', 'menu_responses.json')
    try:
        with open(r_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}

def load_ai_prompt() -> str:
    """Load the AI system prompt from the editable plain-text file."""
    p_path = os.path.join(_BASE, 'responses', 'ai_system_prompt.txt')
    try:
        with open(p_path, 'r', encoding='utf-8') as f:
            return f.read()
    except:
        return ""

# â”€â”€â”€ ðŸ”§ TEMPLATE RENDERER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def build_context(kb: dict, responses: dict) -> dict:
    """
    Extracts all {placeholder} values from Hub knowledge so templates
    in menu_responses.json can be filled with .format(**ctx).
    Add new placeholders here when you add new ones to menu_responses.json.
    """
    # Day tours (updated for special_bookings structure)
    day_tour_data = kb.get("special_bookings", {}).get("day_tour", {})
    pax_fee       = day_tour_data.get("pax_fee_php", 350)
    cottages      = day_tour_data.get("cottage_fees", [])
    
    cottage_info_lines = "\n".join(
        [f"â€¢ {c['pax_range']}: â‚±{c['price_php']:,}" for c in cottages if 'pax_range' in c]
    )

    # Amenities
    facilities   = kb.get("facilities_and_amenities", [])
    addons       = kb.get("add_ons", [])
    facilities_str = "\n".join([f"â€¢ {f}" for f in facilities[:7]])
    addons_str_parts = []
    for a in addons:
        if "price_php" in a:
            addons_str_parts.append(f"â€¢ {a['name']}: â‚±{a['price_php']:,} ({a['unit']})")
        elif "pricing" in a:
            p_list = ", ".join([f"â‚±{p['price_php']:,} ({p['duration']})" for p in a["pricing"]])
            addons_str_parts.append(f"â€¢ {a['name']}: {p_list}")
        else:
            addons_str_parts.append(f"â€¢ {a['name']}")
    addons_str = "\n".join(addons_str_parts)

    # Policies
    pol          = kb.get("booking_and_cancellation_policies", {})
    cancels      = pol.get("cancellation_policy", [])
    cancel_lines = "\n".join([
        f"â€¢ {p['condition']}: {p.get('action') or str(p.get('refund_percent', 0)) + '% refund'}"
        for p in cancels
    ])
    kids_pol     = kb.get("booking_rules", {}).get("kids_policy", {})

    # Socials
    socials      = kb.get("socials_and_booking_links", {})
    about        = kb.get("about", {})

    # Kitchen Rental
    kitchen      = kb.get("kitchen_rental", {})
    k_package    = kitchen.get("package", {})
    kitchen_items_str = "\n".join([f"â€¢ {i}" for i in k_package.get("items", [])])

    # Tent Pitching
    tents        = kb.get("special_bookings", {}).get("tent_pitching", {})

    return {
        # Resort basics
        "resort_name":          kb.get("resort_name", "Amalfi Resort"),
        "location":             kb.get("location", ""),
        "official_website":     kb.get("official_website", "www.amalfi-resort-zambales.online"),
        "about_description":    about.get("description", ""),
        "map_link":             about.get("map_link", ""),
        # Day tours
        "day_tour_entrance_fee": pax_fee,
        "day_tour_cottages":     cottage_info_lines,
        "day_tour_schedule":     day_tour_data.get("schedule", "7 AM - 7 PM"),
        "day_tour_notes":        day_tour_data.get("notes", ""),
        # Kitchen Rental
        "kitchen_description":  kitchen.get("description", ""),
        "kitchen_price":        k_package.get("price_php", 300),
        "kitchen_items":        kitchen_items_str,
        "kitchen_policy":       kitchen.get("policy", ""),
        # Tent Pitching
        "tent_description":     tents.get("description", ""),
        "tent_price":           tents.get("price_php", 500),
        "tent_unit":            tents.get("unit", "per pax"),
        "tent_slots":           tents.get("slots_available", 20),
        "tent_notes":           tents.get("notes", ""),
        # Amenities
        "facilities_list":      facilities_str,
        "addons_list":          addons_str,
        # Policies
        "downpayment_percent":  pol.get("downpayment_required_percent", 50),
        "cancellation_policy":  cancel_lines,
        "free_kids_per_villa":  kids_pol.get("free_kids_per_villa", 2),
        # Socials
        "facebook":             socials.get("facebook", "#"),
        "instagram":            socials.get("instagram", "#"),
        "airbnb":               socials.get("airbnb", "#"),
    }

def render(template: str, ctx: dict) -> str:
    """Safe template render â€” missing keys leave placeholder intact."""
    try:
        return template.format(**ctx)
    except KeyError as e:
        print(f"âš ï¸ [TEMPLATE] Missing placeholder key: {e}")
        return template

# â”€â”€â”€ ðŸ‘¤ FB PROFILE: Get Guest First Name â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def get_fb_first_name(sender_id: str) -> str:
    if not FB_PAGE_ACCESS_TOKEN:
        return ""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"https://graph.facebook.com/v19.0/{sender_id}",
                params={"fields": "first_name", "access_token": FB_PAGE_ACCESS_TOKEN}
            )
            if resp.status_code == 200:
                return resp.json().get("first_name", "")
    except:
        pass
    return ""

# â”€â”€â”€ ðŸ“… AVAILABILITY CHECK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
MONTH_MAP = {
    "january": "01", "february": "02", "march": "03", "april": "04",
    "may": "05", "june": "06", "july": "07", "august": "08",
    "september": "09", "october": "10", "november": "11", "december": "12",
    "enero": "01", "pebrero": "02", "marso": "03", "abril": "04",
    "mayo": "05", "hunyo": "06", "hulyo": "07", "agosto": "08",
    "setyembre": "09", "oktubre": "10", "nobyembre": "11", "disyembre": "12"
}

def looks_like_availability_question(text: str) -> bool:
    text_lower = text.lower()
    date_keywords = [
        "available", "availability", "avail", "may slot", "slot", "meron ba", "libre", "bakante", "vacant", "open",
        "check in", "check-in", "january", "february", "march", "april",
        "may", "june", "july", "august", "september", "october", "november", "december",
        "enero", "pebrero", "marso", "abril", "mayo", "hunyo", "hulyo", "agosto",
        "setyembre", "oktubre", "nobyembre", "disyembre",
        "weekend", "weekday", "holiday", "summer", "sembreak", "vacation",
        "day tour", "entrance fee", "owner", "villa", "room", "rooms", "kubo", "teepee",
        r"\d{1,2}/\d{1,2}", r"\d{4}-\d{2}-\d{2}"
    ]
    return any(re.search(kw, text_lower) for kw in date_keywords)

def has_date_hint(text: str) -> bool:
    text_lower = (text or "").lower()
    if re.search(r"\d{1,2}/\d{1,2}", text_lower) or re.search(r"\d{4}-\d{2}-\d{2}", text_lower):
        return True
    return any(month in text_lower for month in MONTH_MAP.keys())

ROOM_PREFERENCE_ALIASES = [
    ("Owner's Villa", ["owner's villa", "owners villa", "owner villa", "owner"]),
    ("Beach Villa", ["beach villa"]),
    ("Pool Villa", ["pool villa"]),
    ("AC Kubo", ["ac kubo", "aircon kubo", "aircon cottage", "kubo"]),
    ("AC Teepee", ["ac teepee", "teepee", "tepee"]),
]

def detect_room_preference(text: str) -> str | None:
    raw = normalize_menu_text(text or "")
    if not raw:
        return None
    for room_type, aliases in ROOM_PREFERENCE_ALIASES:
        if any(alias in raw for alias in aliases):
            return room_type
    return None

def get_recent_room_preference(history: list[dict] | None) -> str | None:
    for turn in reversed(history or []):
        if str(turn.get("role", "")).lower() != "user":
            continue
        room_type = detect_room_preference(str(turn.get("content", "")))
        if room_type:
            return room_type
    return None

def build_contextual_inquiry_message(message_text: str, history: list[dict] | None) -> tuple[str, str | None]:
    text = message_text or ""
    if not has_date_hint(text) or detect_room_preference(text):
        return text, None
    carried_room = get_recent_room_preference(history)
    if not carried_room:
        return text, None
    return f"{carried_room} {text}", carried_room

def build_availability_details_prompt(language_mode: str) -> str:
    if language_mode == "tagalog":
        return (
            "Sure, ma-check natin ang availability. Please send your check-in date, check-out date, preferred unit, and guest count. "
            "Example: May 8 to May 9, 2 guests, Owner's Villa."
        )
    return (
        "Sure, I can check availability for that. Please send your check-in date, check-out date, preferred unit, and guest count. "
        "Example: May 8 to May 9, 2 guests, Owner's Villa."
    )

def build_out_of_scope_text(language_mode: str) -> str:
    if language_mode == "tagalog":
        return (
            "Pasensya na, para sa Amalfi Resort inquiries lang ako: rooms, rates, availability, day tour, amenities, policies, "
            "directions, payments, at booking questions. Type MENU para makita ang options."
        )
    if language_mode == "taglish":
        return (
            "Sorry, Amalfi Resort inquiries lang ang kaya kong i-assist: rooms, rates, availability, day tour, amenities, policies, "
            "directions, payments, and booking questions. Type MENU to browse options."
        )
    return (
        "I can help with Amalfi Resort rooms, rates, availability, day tours, amenities, policies, directions, payments, and booking questions. "
        "Please type MENU to browse our resort options."
    )

def build_payment_receipt_request_text(language_mode: str) -> str:
    if language_mode == "tagalog":
        return (
            "Salamat. Mukhang booking acknowledgement/slip ito, hindi actual payment receipt. "
            "Please send a screenshot ng GCash, bank transfer, or payment receipt na may amount at reference number para ma-verify namin ang payment."
        )
    if language_mode == "taglish":
        return (
            "Thank you. Mukhang booking acknowledgement/slip ito, not the actual payment receipt. "
            "Please send the GCash, bank transfer, or payment screenshot with amount and reference number so we can verify your payment."
        )
    return (
        "Thank you. This looks like a booking acknowledgement, not the actual payment receipt. "
        "Please send the GCash, bank transfer, or payment screenshot with the amount and reference number so we can verify your payment."
    )

def build_invalid_receipt_image_text(language_mode: str) -> str:
    if language_mode == "tagalog":
        return "Please send a clear payment receipt screenshot showing the amount and transaction/reference number."
    if language_mode == "taglish":
        return "Please send a clear GCash/bank/payment receipt screenshot with the amount and transaction/reference number."
    return "Please send a clear GCash, bank, or payment receipt screenshot showing the amount and transaction/reference number."

def is_resort_related_message(message_text: str, postback_payload: str = "", has_image: bool = False) -> bool:
    raw = normalize_menu_text(f"{message_text or ''} {postback_payload or ''}")
    if not raw:
        return True
    if has_image:
        return True
    if is_main_menu_request(raw):
        return True
    if is_explicit_menu_selection(raw):
        return True

    resort_terms = [
        "breeze", "resort", "liwliwa", "zambales", "san felipe", "beach",
        "manila", "subic", "olongapo", "iba", "botolan", "cabangan", "la union", "baguio", "clark",
        "book", "booking", "reserve", "reservation", "available", "availability", "avail", "vacant", "slot",
        "room", "rooms", "rate", "rates", "price", "pricing", "magkano", "how much",
        "size", "measurement", "measurements", "dimension", "dimensions", "sqm", "square meter", "square meters",
        "meter", "meters", "wide", "width", "length", "height", "capacity", "fit", "fits",
        "villa", "owner", "pool villa", "beach villa", "kubo", "teepee", "ac teepee", "tent",
        "pax", "guest", "guests", "adult", "kid", "kids", "check in", "check out", "checkin", "checkout",
        "day tour", "entrance", "cottage", "camping", "tent pitching",
        "amenity", "amenities", "pool", "atv", "karaoke", "videoke", "bonfire", "banana boat",
        "kitchen", "cook", "cooking", "rental", "add on", "addon", "add ons",
        "policy", "policies", "rules", "downpayment", "payment", "receipt", "gcash", "refund", "rebook", "cancel",
        "location", "directions", "map", "route", "routes", "travel", "travel time", "drive", "driving",
        "commute", "bus", "van", "car", "parking", "distance", "near", "nearby", "far", "kilometer", "kilometers",
        "km", "minutes", "hours", "hrs", "eta", "landmark", "landmarks",
        "contact", "facebook", "instagram", "airbnb",
        "meron", "may", "pwede", "puwede", "saan", "bukas", "mamaya", "overnight", "stay",
        "biyahe", "byahe", "ilang oras", "gaano kalayo", "malapit", "malayo", "sukat", "lawak", "haba", "lapad"
    ]
    return any(term in raw for term in resort_terms) or has_date_hint(raw)

async def extract_dates_with_ai(message: str, kb_data: dict) -> dict | None:
    today  = date.today().isoformat()
    system = (
        f"Today is {today}. Extract check-in and check-out dates from the user's message. "
        "Return ONLY valid JSON: {\"check_in\": \"YYYY-MM-DD\", \"check_out\": \"YYYY-MM-DD\", \"found\": true} "
        "or {\"found\": false} if no specific dates are mentioned. "
        "Assume current year if not specified. If only one date is given, set check_out to +1 day."
    )
    try:
        result = await get_ai_response(message, [], system, "auto")
        if result and result.text:
            parsed = json.loads(result.text)
            if parsed.get("found") and parsed.get("check_in") and parsed.get("check_out"):
                return {"check_in": parsed["check_in"], "check_out": parsed["check_out"]}
    except:
        pass
    return None

async def fetch_availability(check_in: str, check_out: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{HUB_URL}/api/v1/public/availability",
                params={"check_in": check_in, "check_out": check_out}
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"âš ï¸ [AVAILABILITY] Hub call failed: {e}")
    return None

async def fetch_hub_inquiry_analysis(message_text: str, max_suggestions: int = 4) -> dict | None:
    """Use the Hub as the shared inquiry brain for chatbot and admin replies."""
    if not message_text or not message_text.strip():
        return None

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{HUB_URL}/api/v1/admin/inquiry-brain/analyze",
                headers={"Authorization": f"Bearer {INTERNAL_AUTH_TOKEN}"},
                json={"message": message_text, "max_suggestions": max_suggestions}
            )
            if resp.status_code == 200:
                data = resp.json()
                return data if isinstance(data, dict) else None
            print(f"Hub inquiry brain returned HTTP {resp.status_code}: {resp.text[:160]}")
    except Exception as e:
        print(f"Hub inquiry brain call failed: {e}")
    return None

def format_availability_for_ai(avail_data: dict) -> str:
    if not avail_data:
        return ""
    lines = [f"REAL-TIME AVAILABILITY ({avail_data['check_in']} to {avail_data['check_out']}):"]
    for room in avail_data.get("availability", []):
        status = f"âœ… {room['available_units']} unit(s) available" if room["is_available"] else "âŒ FULLY BOOKED"
        price_str = f"â‚±{room['price']:,}" if "price" in room else "Price varies"
        lines.append(f"\nðŸ  {room['room_type']} ({room.get('marketing_name','')}) â€” {price_str}: {status}")
        # Per-unit detail (if the API provides it)
        for unit in room.get("units", []):
            if unit["status"] == "AVAILABLE":
                lines.append(f"   âœ… {unit['unit_id']} â€” AVAILABLE")
            else:
                guest = unit.get("guest", "a guest")
                dates = f"{unit.get('booked_from','?')} â†’ {unit.get('booked_to','?')}"
                lines.append(f"   âŒ {unit['unit_id']} â€” BOOKED by {guest} ({dates})")
    return "\n".join(lines)

def _format_php(value) -> str:
    try:
        return f"PHP {float(value):,.0f}"
    except (TypeError, ValueError):
        return "PHP 0"

def format_hub_analysis_for_ai(analysis: dict, carried_room_preference: str | None = None) -> str:
    """Format Hub inquiry analysis as strict context for the response LLM."""
    if not analysis or not isinstance(analysis, dict):
        return ""

    context = analysis.get("context") or {}
    live = analysis.get("live_inventory") or {}
    suggestions = analysis.get("suggestions") or []

    lines = [
        "HUB INQUIRY BRAIN CONTEXT:",
        f"Engine: {analysis.get('analysis_engine', 'hub_inquiry_brain')}",
        f"Carried room preference from previous guest turn: {carried_room_preference or 'none'}",
        f"Detected check-in: {context.get('check_in') or 'not detected'}",
        f"Detected check-out: {context.get('check_out') or 'not detected'}",
        f"Detected pax: {context.get('guests') or 'not detected'}",
        f"Detected room type: {context.get('room_type') or 'not detected'}",
        f"Live inventory checked: {'yes' if live.get('checked') else 'no'}",
    ]

    if live.get("checked"):
        lines.append(f"Available unit count: {live.get('available_unit_count', 0)}")
        available_units = live.get("available_units") or []
        if available_units:
            lines.append("Available units:")
            for unit in available_units[:12]:
                rate = _format_php(unit.get("nightly_rate"))
                label = unit.get("unit_label") or unit.get("unit_id")
                lines.append(f"- {label}: {unit.get('room_type', 'Unit')}, nightly rate {rate}")
        else:
            lines.append("No matching units are available for the detected date range.")
    else:
        lines.append("Availability was not checked because the Hub did not detect a complete date range.")

    if suggestions:
        lines.append("Best booking suggestions:")
        for idx, suggestion in enumerate(suggestions[:4], start=1):
            summary = suggestion.get("summary") or {}
            total = _format_php(summary.get("total_amount"))
            mode = suggestion.get("mode", "suggestion")
            lines.append(f"{idx}. {mode} setup, {summary.get('total_units', len(suggestion.get('units') or []))} unit(s), estimated total {total}")
            for unit in (suggestion.get("units") or [])[:6]:
                label = unit.get("unit_label") or unit.get("unit_id")
                room = unit.get("room_type") or unit.get("marketing_name") or "Unit"
                unit_total = _format_php(unit.get("total_amount"))
                lines.append(f"   - {label}: {room}, {unit_total}")

    if carried_room_preference:
        lines.append(f"Preference rule: the guest is continuing their {carried_room_preference} inquiry. Answer about {carried_room_preference} first. Only offer other unit types if that preferred unit is unavailable or the guest asks for alternatives.")
    lines.append("Reply rule: use this Hub context as the source of truth. If live inventory is checked, do not ask again for dates already detected.")
    lines.append("Capacity wording rule: do not mention pax limits, 'up to N pax', assigned guest counts, or capacity numbers in guest replies. Keep replies focused on unit names, availability, and prices.")
    lines.append("Booking rule: do not create or confirm a booking automatically; tell the guest an admin will confirm the hold/payment details.")
    return "\n".join(lines)

def sanitize_guest_reply(text: str) -> str:
    """Remove capacity phrases that can confuse guests; pricing and unit names remain."""
    cleaned = str(text or "")
    cleaned = re.sub(r"\s*\(?\s*up to\s+\d{1,3}\s*(?:pax|guests?|people|persons?|heads?)\s*\)?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\(?\s*good for\s+\d{1,3}\s*(?:pax|guests?|people|persons?|heads?)\s*\)?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\(?\s*max(?:imum)?\s+(?:of\s+)?\d{1,3}\s*(?:pax|guests?|people|persons?|heads?)\s*\)?", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\|\s*\d{1,3}\s*-\s*\d{1,3}\s*(?:pax|guests?)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\.{2,}", ".", cleaned)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()

def build_room_rate_elements(kb: dict) -> list[dict]:
    elements = []
    for room in kb.get("accommodations", [])[:10]:
        rates = room.get("rates") or []
        best_rate = f"PHP {rates[0]['price_php']:,}" if rates and rates[0].get("price_php") else "Rate varies"
        feature = (room.get("features") or ["View details"])[0]
        img_path = room.get("image") or "/resort-logo.jpg"
        img_url = img_path if str(img_path).startswith("http") else f"{BOOKING_URL}{img_path}"
        elements.append({
            "title": str(room.get("name") or room.get("marketing_name") or "Amalfi Unit").upper(),
            "subtitle": sanitize_guest_reply(f"{best_rate} | {feature}")[:80],
            "image_url": img_url,
            "buttons": [
                {"type": "web_url", "url": BOOKING_URL, "title": "Book Now"},
            ],
        })
    return elements

def build_room_rates_text(kb: dict) -> str:
    lines = ["*Rooms & Rates*", "Here are our accommodation options:"]
    for room in kb.get("accommodations", [])[:10]:
        rates = room.get("rates") or []
        best_rate = f"PHP {rates[0]['price_php']:,}" if rates and rates[0].get("price_php") else "Rate varies"
        lines.append(f"- {room.get('name', 'Amalfi Unit')}: {best_rate}")
    lines.append("\nUse Book Now to check dates and final availability.")
    return sanitize_guest_reply("\n".join(lines))

# â”€â”€â”€ ðŸ’¬ CONVERSATION MEMORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def get_history(sender_id: str) -> list:
    cached = CONVERSATION_MEMORY.get(sender_id, [])
    if cached:
        return cached

    try:
        if not LOG_FILE.exists():
            return []
        rows = []
        with open(LOG_FILE, mode="r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if (row.get("Sender ID") or "") == sender_id:
                    rows.append(row)
        history = []
        for row in rows[-MAX_HISTORY_TURNS:]:
            user_text = (row.get("User Message") or "").strip()
            bot_text = (row.get("Bot Answer") or "").strip()
            intent = (row.get("Intent") or "").strip()
            if user_text and user_text not in {"[Attachment]", "..."} and intent != "incoming_event":
                history.append({"role": "user", "content": user_text})
            if bot_text and bot_text != "...":
                history.append({"role": "assistant", "content": bot_text})
        CONVERSATION_MEMORY[sender_id] = history[-(MAX_HISTORY_TURNS * 2):]
        return CONVERSATION_MEMORY[sender_id]
    except Exception as exc:
        print(f"[MEMORY] Failed to restore history for {sender_id}: {exc}")
        return []

def save_user_to_history(sender_id: str, user_msg: str):
    text = (user_msg or "").strip()
    if not text or text == "[Attachment]":
        return
    history = CONVERSATION_MEMORY.get(sender_id) or get_history(sender_id)
    if history and history[-1].get("role") == "user" and history[-1].get("content") == text:
        return
    history.append({"role": "user", "content": text})
    CONVERSATION_MEMORY[sender_id] = history[-(MAX_HISTORY_TURNS * 2):]

def save_to_history(sender_id: str, user_msg: str, bot_reply: str):
    history = CONVERSATION_MEMORY.get(sender_id) or get_history(sender_id)
    if user_msg and not (history and history[-1].get("role") == "user" and history[-1].get("content") == user_msg):
        history.append({"role": "user", "content": user_msg})
    if bot_reply:
        history.append({"role": "assistant", "content": bot_reply})
    CONVERSATION_MEMORY[sender_id] = history[-(MAX_HISTORY_TURNS * 2):]

def clear_history(sender_id: str):
    CONVERSATION_MEMORY.pop(sender_id, None)
    USER_MESSAGE_COUNTS.pop(sender_id, None)

def get_daily_ai_count(sender_id: str, today: str | None = None) -> int:
    day_key = today or date.today().isoformat()
    try:
        persisted = get_daily_ai_usage(sender_id, day_key)
        DAILY_AI_MESSAGE_COUNTS[(sender_id, day_key)] = persisted
        return persisted
    except Exception:
        return DAILY_AI_MESSAGE_COUNTS.get((sender_id, day_key), 0)

def increment_daily_ai_count(sender_id: str, today: str | None = None) -> int:
    day_key = today or date.today().isoformat()
    try:
        updated = increment_daily_ai_usage(sender_id, day_key)
        DAILY_AI_MESSAGE_COUNTS[(sender_id, day_key)] = updated
        return updated
    except Exception:
        key = (sender_id, day_key)
        DAILY_AI_MESSAGE_COUNTS[key] = DAILY_AI_MESSAGE_COUNTS.get(key, 0) + 1
        return DAILY_AI_MESSAGE_COUNTS[key]

def get_ai_daily_limit(classification: dict | None = None, message_text: str = "", has_image: bool = False) -> int:
    category = str((classification or {}).get("category") or "").upper()
    reason = str((classification or {}).get("reason") or "").lower()
    text = (message_text or "").strip().lower()

    if has_image or category in {"PAYMENT_SENT", "NEEDS_HUMAN", "MANUAL_ACTIVE"}:
        return BOOKING_AI_DAILY_LIMIT
    if category in {"HOT_BOOKING_LEAD", "COMPLAINT", "REBOOKING_OR_CANCELLATION"}:
        return BOOKING_AI_DAILY_LIMIT
    if category == "SPAM_OR_NONSENSE" or reason in {"very_short_or_noise", "empty_message"}:
        return LOW_QUALITY_AI_DAILY_LIMIT
    if len(text) <= 4 and text not in {"menu", "back"}:
        return LOW_QUALITY_AI_DAILY_LIMIT
    return NORMAL_AI_DAILY_LIMIT

def detect_language_mode(text: str) -> str:
    raw = (text or "").strip().lower()
    if not raw:
        return "english"

    tagalog_markers = [
        "ano", "paano", "pwede", "puwede", "magkano", "saan", "ilan", "meron",
        "may", "kaya", "kasya", "para sa", "namin", "kami", "po", "opo",
        "ba", "lang", "din", "yung", "mga", "dito", "doon", "katao", "tao",
        "meron bang", "pwede ba", "available ba"
    ]
    english_markers = [
        "what", "how", "where", "price", "rates", "recommend", "available",
        "book", "booking", "rooms", "overnight", "day tour", "can you", "please"
        , "hello", "hi", "for"
    ]

    tagalog_hits = sum(1 for marker in tagalog_markers if marker in raw)
    english_hits = sum(1 for marker in english_markers if marker in raw)

    if tagalog_hits >= 2 and english_hits >= 2:
        return "taglish"
    if tagalog_hits >= 2:
        return "tagalog"
    if tagalog_hits >= 1 and english_hits >= 1:
        return "taglish"
    return "english"

def build_localized_fallback_text(language_mode: str) -> str:
    if language_mode == "tagalog":
        return "Pasensya na, hindi ko pa nasagot nang maayos. Pwede mong itanong ulit o i-tap ang MENU para sa rooms, rates, at policies."
    if language_mode == "taglish":
        return "Sorry, hindi ko pa nasagot nang ayos. You can ask again or tap MENU para makita ang rooms, rates, and policies."
    return "Sorry, I may have missed that. Please try asking again, or tap MENU to browse rooms, rates, and policies."

def build_soft_cap_message(language_mode: str) -> tuple[str, str]:
    if language_mode == "tagalog":
        return (
            "Naabot na ang daily AI assistance limit for today. Pwede ka pa ring mag-browse sa MENU o dumiretso sa booking site para sa full details.",
            "Bisitahin ang Booking Site"
        )
    if language_mode == "taglish":
        return (
            "Na-reach na natin ang daily AI assistance limit for today. You can still use MENU or go straight to the booking site for full details.",
            "Open Booking Site"
        )
    return (
        "You've reached today's AI assistance soft cap. You can still use MENU or head to our booking site for complete details.",
        "Open Booking Site"
    )

def build_human_handoff_text(language_mode: str) -> str:
    wait_text = "around 30 minutes" if BOT_AUTO_RESUME_MINUTES == 30 else f"around {BOT_AUTO_RESUME_MINUTES} minutes"
    if language_mode == "tagalog":
        return (
            "Salamat sa pag-message. Ang concern mo ay mas mabuting hawakan ng isa naming human guest services specialist. "
            "Na-flag na namin ito for manual follow-up, at babalikan ka namin as soon as possible.\n\n"
            f"Habang hinihintay mo ang update, puwede mong i-type ang MENU para makita ang rooms, rates, at resort details. Kapag walang manual reply for {wait_text}, babalik ang automated assistant."
        )
    if language_mode == "taglish":
        return (
            "Thanks for your message. Mukhang mas okay itong i-handle ng human guest services specialist namin. "
            "Na-flag na namin ito for manual follow-up, and our team will get back to you as soon as possible.\n\n"
            f"While waiting, you can type MENU to browse rooms, rates, and resort details. If no manual reply is sent for {wait_text}, the automated assistant will resume."
        )
    return (
        "Thanks for your message. This one is better handled by one of our human guest services specialists. "
        "We've flagged your chat for manual follow-up, and our team will get back to you as soon as possible.\n\n"
        f"While you wait, you can type MENU to browse rooms, rates, and resort details. If no manual reply is sent for {wait_text}, the automated assistant will resume."
    )

def build_booking_guidance_text(language_mode: str) -> str:
    if language_mode == "tagalog":
        return (
            "Para sa room planning at best-fit setup, mas okay na gamitin ang Book Now option o makipag-usap sa aming guest services team. "
            "Doon namin mas ma-che-check ang tamang unit, dates, at final arrangement para sa inyo."
        )
    if language_mode == "taglish":
        return (
            "For room planning and the best-fit setup, mas okay to use the Book Now option or chat with our guest services team. "
            "That way we can check the right unit, dates, and final arrangement for your stay."
        )
    return (
        "For room planning and the best-fit setup, please use the Book Now option or speak with our guest services team. "
        "That helps us confirm the right unit, dates, and final arrangement for your stay."
    )

def build_combo_booking_handoff_text(language_mode: str) -> str:
    if language_mode == "tagalog":
        return (
            "Mukhang combo booking ito at posibleng mangailangan ng higit sa isang room para maayos ang arrangement. "
            "Ililipat ka namin sa live guest support para matulungan ka sa tamang room combination at booking setup."
        )
    if language_mode == "taglish":
        return (
            "Mukhang combo booking ito and it may need more than one room for the best setup. "
            "Weâ€™ll transfer you to our live guest support team so they can help with the right room combination and booking arrangement."
        )
    return (
        "This looks like a combo booking and may require more than one room for the best setup. "
        "Weâ€™ll transfer you to our live guest support team so they can help arrange the right room combination and booking details."
    )

def detect_handoff_need(message_text: str) -> dict | None:
    raw = (message_text or "").lower().strip()
    if not raw:
        return None

    explicit_human = [
        "human", "real person", "agent", "staff", "customer service", "guest services",
        "representative", "operator", "manager", "admin", "tao", "actual person",
        "someone call me", "call me", "pwede may kausap", "may makakausap ba",
        "gusto ko ng tao", "need help from staff", "talk to someone"
    ]
    payment_requests = [
        "payment inquiry", "payment concern", "payment concerns", "payment follow up",
        "payment follow-up", "proof of payment", "payment receipt", "payment not reflected",
        "payment is not reflected",
        "payment issue", "wrong charge", "overcharged", "receipt issue"
    ]

    if any(keyword in raw for keyword in explicit_human):
        return {"reason": "guest_requested_human", "urgency": "high"}
    if any(keyword in raw for keyword in payment_requests):
        return {"reason": "payment_inquiry", "urgency": "medium"}
    return None

def categorize_inquiry(message_text: str = "", postback_payload: str = "", has_image: bool = False) -> dict:
    raw = f"{message_text or ''} {postback_payload or ''}".lower().strip()
    if has_image:
        return {"category": "PAYMENT_SENT", "priority": "high", "reason": "attachment_or_receipt"}
    if not raw:
        return {"category": "SPAM_OR_NONSENSE", "priority": "low", "reason": "empty_message"}

    complaint_terms = [
        "complaint", "complain", "bad experience", "angry", "disappointed",
        "cancel", "scam", "overcharged", "wrong charge", "not satisfied", "issue",
        "problem", "pangit", "reklamo", "hindi ok", "hindi okay"
    ]
    payment_terms = [
        "paid", "payment", "gcash", "bank transfer", "receipt", "proof of payment",
        "sent payment", "deposit", "downpayment", "reference number", "transaction"
    ]
    booking_action_terms = [
        "available", "availability", "vacant", "book", "booking", "reserve", "reservation",
        "check in", "check-in", "checkout", "check out", "how much", "rate", "rates",
        "price", "pricing", "quote", "estimate", "can we stay", "pwede mag book",
        "pwede magbook", "mag reserve", "magreserve"
    ]
    booking_context_terms = [
        "pax", "guest", "guests", "room", "villa", "kubo", "teepee", "tent",
        "overnight", "day tour"
    ]
    rebooking_terms = [
        "rebook", "reschedule", "change date", "move date", "change my booking",
        "cancel booking", "cancellation", "refund policy"
    ]
    confirmed_terms = [
        "booked na", "confirmed booking", "booking confirmed", "may booking na",
        "reserved na", "reservation confirmed", "paid booking", "already booked"
    ]
    spam_terms = ["test", "asdf", "qwerty", "haha", "hehe", "sticker"]
    has_room = detect_room_preference(raw) is not None
    has_dates = has_date_hint(raw)
    has_pax = re.search(r"\b\d{1,3}\s*(pax|guests?|people|persons?|katao|tao|heads?)\b", raw) is not None
    has_booking_action = any(term in raw for term in [
        "book", "booking", "reserve", "reservation", "hold", "proceed", "confirm",
        "mag book", "magbook", "mag reserve", "magreserve", "ituloy", "go na"
    ])
    booking_ready = has_room and has_dates and has_pax

    if any(term in raw for term in confirmed_terms):
        return {"category": "CONFIRMED_BOOKING", "priority": "medium", "reason": "already_booked_language"}
    if any(term in raw for term in rebooking_terms):
        return {"category": "REBOOKING_OR_CANCELLATION", "priority": "high", "reason": "date_change_or_cancel_language"}
    if any(term in raw for term in complaint_terms):
        return {"category": "COMPLAINT", "priority": "critical", "reason": "complaint_or_refund_language"}
    if any(term in raw for term in payment_terms):
        return {"category": "PAYMENT_SENT", "priority": "high", "reason": "payment_language"}
    if detect_handoff_need(raw):
        return {"category": "NEEDS_HUMAN", "priority": "high", "reason": "human_requested"}
    if booking_ready:
        return {"category": "HOT_BOOKING_LEAD", "priority": "high", "reason": "complete_booking_details"}
    if has_booking_action and has_dates and (has_room or has_pax):
        return {"category": "HOT_BOOKING_LEAD", "priority": "high", "reason": "strong_booking_intent"}
    if any(term in raw for term in booking_action_terms) or looks_like_availability_question(raw) or any(term in raw for term in booking_context_terms):
        return {"category": "LOW_PRIORITY_FAQ", "priority": "normal", "reason": "booking_inquiry_needs_details"}
    if len(raw) <= 4 or raw in spam_terms:
        return {"category": "SPAM_OR_NONSENSE", "priority": "low", "reason": "very_short_or_noise"}
    return {"category": "LOW_PRIORITY_FAQ", "priority": "normal", "reason": "general_inquiry"}

def should_use_ai_triage(message_text: str, classification: dict, has_image: bool = False) -> bool:
    if not AI_TRIAGE_ENABLED or has_image:
        return False
    if not os.getenv("OPENAI_API_KEY"):
        return False
    text = (message_text or "").strip()
    if len(text) < AI_TRIAGE_MIN_CHARS:
        return False
    if classification.get("category") not in {"LOW_PRIORITY_FAQ", "SPAM_OR_NONSENSE"}:
        return False
    if classification.get("reason") == "very_short_or_noise":
        return False
    return True

async def classify_conversation_with_ai(message_text: str, history: list[dict] | None = None) -> dict | None:
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key:
        return None

    history_lines = []
    for turn in (history or [])[-6:]:
        role = str(turn.get("role", "guest")).lower()
        content = str(turn.get("content", ""))[:260]
        if content:
            history_lines.append(f"{role}: {content}")

    system_prompt = (
        "You are an operations triage classifier for Amalfi Resort. "
        "Classify guest chat for admin inbox routing. Return JSON only with keys: "
        "category, priority, confidence, reason, suggested_action. "
        "Allowed category values: HOT_BOOKING_LEAD, CONFIRMED_BOOKING, PAYMENT_SENT, COMPLAINT, "
        "REBOOKING_OR_CANCELLATION, NEEDS_HUMAN, MANUAL_ACTIVE, LOW_PRIORITY_FAQ, SPAM_OR_NONSENSE. "
        "Allowed priority values: low, normal, medium, high, critical. "
        "Use high/critical priority only when an admin should act soon: complete booking details, payment, complaint, "
        "rebooking/cancellation, or human handoff. Use HOT_BOOKING_LEAD only when the guest provides enough booking-ready "
        "details such as preferred unit, stay dates, and pax, or explicitly asks to reserve/proceed with a specific stay. "
        "Do not mark simple availability checks, unit questions, dates-only messages, or unit+date messages as high priority. "
        "Use LOW_PRIORITY_FAQ with low/normal priority for simple resort-adjacent info such as amenities, rules, "
        "weather, geography, travel time, nearby places, history, directions, and general curiosity without a booking action. "
        "Use SPAM_OR_NONSENSE with low priority for tests/noise/unrelated questions. "
        "Use CONFIRMED_BOOKING with medium priority for already-booked/resolved threads unless payment or an issue needs action. "
        "Keep reason and suggested_action under 120 characters."
    )
    user_prompt = (
        f"Recent context:\n{chr(10).join(history_lines) if history_lines else '(none)'}\n\n"
        f"Latest guest message:\n{message_text}"
    )
    payload = {
        "model": AI_TRIAGE_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 220,
    }
    headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        if resp.status_code != 200:
            print(f"[AI_TRIAGE] OpenAI error {resp.status_code}: {resp.text[:300]}")
            return None
        raw = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(raw)
        category = str(data.get("category") or "").upper()
        priority = str(data.get("priority") or "normal").lower()
        confidence = float(data.get("confidence") or 0)
        if category not in TRIAGE_CATEGORIES or priority not in TRIAGE_PRIORITIES:
            return None
        return {
            "category": category,
            "priority": priority,
            "confidence": max(0, min(1, confidence)),
            "reason": str(data.get("reason") or "")[:180],
            "suggested_action": str(data.get("suggested_action") or "")[:180],
        }
    except Exception as exc:
        print(f"[AI_TRIAGE] Failed: {exc}")
        return None

async def maybe_apply_ai_triage(sender_id: str, message_text: str, classification: dict, has_image: bool = False):
    if not should_use_ai_triage(message_text, classification, has_image):
        return None
    ai_result = await classify_conversation_with_ai(message_text, get_history(sender_id))
    if not ai_result:
        return None
    update_conversation_metadata(
        sender_id,
        ai_result["category"],
        ai_result["priority"],
        last_message=False,
        source="ai",
        ai_confidence=ai_result["confidence"],
        ai_reason=ai_result["reason"],
        ai_suggested_action=ai_result["suggested_action"],
    )
    return ai_result

def activate_manual_handoff(sender_id: str, message_text: str, bot_answer: str, reason: str = "guest_requested_human", urgency: str = "high", source: str = "messenger") -> None:
    create_handoff_alert(sender_id, message_text, bot_answer, reason, urgency, source)
    set_conversation_pause(
        sender_id,
        True,
        duration_hours=HANDOFF_PAUSE_HOURS,
        reason=reason,
        category="NEEDS_HUMAN",
        priority="high",
    )

def create_handoff_alert(sender_id: str, message_text: str, bot_answer: str, reason: str, urgency: str, source: str) -> None:
    try:
        create_chatbot_alert(
            sender_id=sender_id,
            user_message=message_text or "[No text provided]",
            bot_answer=bot_answer,
            escalation_reason=reason,
            urgency=urgency,
            source=source,
        )
    except Exception as exc:
        print(f"Alert creation failed: {exc}")

def looks_like_room_recommendation_question(text: str) -> bool:
    raw = (text or "").lower()
    keywords = [
        "recommend", "recommendation", "suggest", "best room", "best villa",
        "for", "pax", "guests", "people", "group", "overnight", "good for",
        "ano pong recommendation", "ano recommendation", "anong room",
        "anong villa", "para sa", "kasya", "ilang room"
    ]
    has_number = re.search(r"\b\d{1,3}\s*(pax|guests?|people|persons?|katao|tao|heads?)?\b", raw) is not None
    return has_number and any(keyword in raw for keyword in keywords)

def should_prompt_for_availability_details(text: str) -> bool:
    raw = normalize_menu_text(text or "")
    if not raw or has_date_hint(raw):
        return False
    if re.search(r"\b(bed|beds|capacity|kasya|fit|fits|how many|ilan|good for|amenities|rules|policy|policies|rate|rates|price|how much|magkano)\b", raw):
        return False
    availability_terms = [
        "available", "availability", "avail", "vacant", "slot", "may slot",
        "meron ba", "libre", "bakante", "open", "check in", "check-in",
    ]
    return any(term in raw for term in availability_terms)

def detect_recommendation_mode(text: str) -> str:
    raw = (text or "").lower()
    if any(keyword in raw for keyword in ["tent", "camp", "pitching", "camping"]):
        return "tent"
    if any(keyword in raw for keyword in ["day tour", "daytour", "cottage"]):
        return "day_tour"
    return "overnight"

def extract_group_size(text: str) -> int | None:
    raw = (text or "").lower()
    match = re.search(r"\b(\d{1,3})\s*(pax|guests?|people|persons?|katao|tao|heads?)\b", raw)
    if match:
        return int(match.group(1))
    if any(keyword in raw for keyword in ["pax", "guests", "people", "katao", "tao", "group"]):
        fallback = re.search(r"\b(\d{1,3})\b", raw)
        if fallback:
            return int(fallback.group(1))
    return None

def build_room_catalog(kb: dict) -> list[dict]:
    catalog = []
    for room in kb.get("accommodations", []):
        rates = room.get("rates", [])
        if not rates:
            continue
        base_rate = rates[0]
        base_pax = int(base_rate.get("max_pax", room.get("max_capacity_pax", 0)) or 0)
        max_capacity = int(room.get("extra_pax", {}).get("max_capacity_pax") or room.get("max_capacity_pax") or base_pax)
        extra_price = int(room.get("extra_pax", {}).get("price_per_head_php", 0) or 0)
        catalog.append({
            "name": room.get("name", "Room"),
            "marketing_name": room.get("marketing_name", room.get("name", "Room")),
            "units": int(room.get("units", 1) or 1),
            "base_pax": base_pax,
            "max_capacity": max_capacity,
            "base_price": int(base_rate.get("price_php", 0) or 0),
            "extra_price": extra_price,
        })
    return catalog

def allocate_guests_to_units(target_pax: int, selected_units: list[dict]) -> dict | None:
    if not selected_units:
        return None

    allocations = [{**unit, "assigned_pax": 0} for unit in selected_units]
    remaining = target_pax

    for unit in sorted(allocations, key=lambda item: (-item["base_pax"], item["name"])):
        if remaining <= 0:
            break
        give = min(unit["base_pax"], remaining)
        unit["assigned_pax"] += give
        remaining -= give

    for unit in sorted(allocations, key=lambda item: (item["extra_price"] if item["extra_price"] > 0 else 10**9, -(item["max_capacity"] - item["base_pax"]))):
        if remaining <= 0:
            break
        extra_slots = max(0, unit["max_capacity"] - unit["assigned_pax"])
        if extra_slots <= 0:
            continue
        give = min(extra_slots, remaining)
        unit["assigned_pax"] += give
        remaining -= give

    if remaining > 0:
        return None

    total_price = 0
    used_units = []
    for unit in allocations:
        if unit["assigned_pax"] <= 0:
            continue
        extra_heads = max(0, unit["assigned_pax"] - unit["base_pax"])
        unit_price = unit["base_price"] + (extra_heads * unit["extra_price"])
        used_units.append({
            **unit,
            "extra_heads": extra_heads,
            "unit_price": unit_price
        })
        total_price += unit_price

    return {
        "units": used_units,
        "unit_count": len(used_units),
        "total_capacity": sum(unit["max_capacity"] for unit in used_units),
        "total_price": total_price,
    }

def find_room_recommendations(target_pax: int, kb: dict, top_n: int = 2) -> list[dict]:
    catalog = build_room_catalog(kb)
    combos = []

    def search(index: int, selected_units: list[dict]):
        if index >= len(catalog):
            if not selected_units:
                return
            total_capacity = sum(unit["max_capacity"] for unit in selected_units)
            if total_capacity < target_pax:
                return
            plan = allocate_guests_to_units(target_pax, selected_units)
            if not plan:
                return
            combos.append({
                **plan,
                "overage": plan["total_capacity"] - target_pax
            })
            return

        room = catalog[index]
        for count in range(room["units"] + 1):
            next_units = selected_units + ([room] * count)
            search(index + 1, next_units)

    search(0, [])

    ranked = sorted(
        combos,
        key=lambda combo: (
            combo["unit_count"],
            combo["overage"],
            combo["total_price"]
        )
    )

    deduped = []
    seen = set()
    for combo in ranked:
        signature = tuple(sorted((unit["name"], unit["assigned_pax"]) for unit in combo["units"]))
        if signature in seen:
            continue
        seen.add(signature)
        deduped.append(combo)
        if len(deduped) >= top_n:
            break
    return deduped

def needs_combo_booking_handoff(message_text: str, kb: dict) -> bool:
    if not looks_like_room_recommendation_question(message_text):
        return False

    target_pax = extract_group_size(message_text)
    if not target_pax:
        return False

    top_match = find_room_recommendations(target_pax, kb, top_n=1)
    if not top_match:
        return False

    return int(top_match[0].get("unit_count", 0) or 0) > 1

def format_room_recommendation(combo: dict, target_pax: int, language_mode: str = "english") -> str:
    unit_lines = []
    for unit in combo.get("units", []):
        if unit["extra_heads"] > 0:
            detail = f"base PHP {unit['base_price']:,} + add-on guest charges"
        else:
            detail = f"base PHP {unit['base_price']:,}"
        unit_lines.append(
            f"{unit['name']} - PHP {unit['unit_price']:,} ({detail})"
        )

    if language_mode == "tagalog":
        lead = "Ito ang pinaka-efficient na overnight setup based sa request mo:"
        footer = f"Tinatayang total: PHP {combo['total_price']:,} across {combo['unit_count']} unit(s)."
    elif language_mode == "taglish":
        lead = "Based sa request mo, ito ang pinaka-efficient na room setup:"
        footer = f"Estimated total: PHP {combo['total_price']:,} across {combo['unit_count']} unit(s)."
    else:
        lead = "Based on your request, this is the most efficient overnight room setup:"
        footer = f"Estimated total: PHP {combo['total_price']:,} across {combo['unit_count']} unit(s)."

    rows = [f"{idx + 1}. {line}" for idx, line in enumerate(unit_lines)]
    return "\n".join([lead, *rows, footer])

def build_special_recommendation_response(mode: str, pax: int, kb: dict, language_mode: str = "english") -> str:
    specials = kb.get("special_bookings", {})
    if mode == "tent":
        tent = specials.get("tent_pitching", {})
        rate = int(tent.get("price_php", 500) or 500)
        total = pax * rate
        if language_mode == "tagalog":
            return f"Para sa tent pitching, current rate is PHP {rate:,} per tent slot. Estimated base total: PHP {total:,}, subject to slot availability."
        if language_mode == "taglish":
            return f"For tent pitching, current rate is PHP {rate:,} per tent slot. Estimated base total: PHP {total:,}, subject to slot availability."
        return f"For tent pitching, the current rate is PHP {rate:,} per tent slot. Estimated base total: PHP {total:,}, subject to slot availability."

    if mode == "day_tour":
        day_tour = specials.get("day_tour", {})
        entrance = int(day_tour.get("pax_fee_php", 350) or 350)
        total = pax * entrance
        if language_mode == "tagalog":
            return f"Para sa day tour, current entrance estimate is PHP {entrance:,} per head, around PHP {total:,} total, exclusive of cottage fees and subject to slot availability."
        if language_mode == "taglish":
            return f"For day tour, current entrance estimate is PHP {entrance:,} per head, around PHP {total:,} total, exclusive of cottage fees and subject to slot availability."
        return f"For a day tour, the current entrance estimate is PHP {entrance:,} per head, around PHP {total:,} total, exclusive of cottage fees and subject to slot availability."

    return ""

def build_ai_prompt(raw_prompt: str, kb: dict, availability_context: str, language_mode: str) -> str:
    base_prompt = raw_prompt.replace("{knowledge_base}", json.dumps(kb)).replace(
        "{availability_context}",
        availability_context.strip() if availability_context else "(No real-time availability data for this query.)"
    )
    language_instruction = (
        "\n\nLANGUAGE DIRECTIVE:\n"
        f"- Detected guest language mode: {language_mode}\n"
        "- If language mode is tagalog, answer in natural Filipino.\n"
        "- If language mode is taglish, answer in natural Taglish.\n"
        "- If language mode is english, answer in English.\n"
        "- Never fall back to generic English if the guest used Tagalog or Taglish.\n"
        "- Never recommend a room setup that exceeds the max capacity of any room.\n"
        "- Do not mention room pax limits, 'up to N pax', assigned pax, or capacity numbers in chat replies. Focus on unit name, price, availability, and next step.\n"
        "- Do not invent availability, prices, policies, or unit facts. If Hub context or knowledge base does not provide a fact, say guest services can confirm.\n"
    )
    return base_prompt + language_instruction

def normalize_menu_text(value: str) -> str:
    cleaned = re.sub(r"[^\w\s&]+", " ", (value or "").lower())
    cleaned = cleaned.replace("_", " ")
    return " ".join(cleaned.split())

def is_explicit_menu_selection(message_text: str) -> bool:
    raw = normalize_menu_text(message_text)
    explicit_labels = {
        "resort info",
        "stay options",
        "day tour & camping",
        "day tour and camping",
        "rentals & add-ons",
        "rentals & add ons",
        "rentals and add-ons",
        "rentals and add ons",
        "rooms & rates",
        "rooms and rates",
        "day tours",
        "tent pitching",
        "kitchen rental",
        "amenities",
        "rules & policies",
        "rules and policies",
        "payment inquiry",
        "how to get here",
        "directions",
        "contact & socials",
        "contact and socials",
    }
    return raw in explicit_labels

def resolve_structured_menu_response(message_text: str, responses: dict, ctx: dict, language_mode: str) -> dict | None:
    raw = (message_text or "").lower()
    menu_prompts = {
        "stay_options": ["stay options", "overnight stay", "overnight options", "stay", "accommodation options"],
        "day_tour_and_camping": ["day tour and camping", "day tour & camping", "camping options", "camping and day tour"],
        "rentals_and_add_ons": ["rentals and add ons", "rentals & add-ons", "add ons", "add-ons", "extras", "other add ons"],
        "rooms_and_rates": ["room", "rooms", "rate", "rates", "villa", "kubo", "teepee", "magkano room", "how much room"],
        "day_tours": ["day tour", "day tours", "entrance fee", "cottage", "cottages"],
        "tent_pitching": ["tent", "camping", "tent pitching", "camp"],
        "kitchen_rental": ["kitchen", "cook", "cooking ware", "utensils", "rental"],
        "amenities": ["amenities", "pool", "beach", "atv", "videoke", "karaoke", "bonfire", "banana boat"],
        "rules_and_policies": ["policy", "policies", "downpayment", "refund", "rebooking", "cancellation", "check in", "check out", "kids policy", "pet", "pets", "dog", "cat", "aso", "pusa", "rules", "regulations"],
        "payment_inquiry": ["payment inquiry", "payment concern", "payment follow up", "payment follow-up", "proof of payment", "payment receipt"],
        "directions": ["location", "map", "directions", "how to get", "saan", "where are you"],
        "contact_and_socials": ["contact", "facebook", "instagram", "social", "socials", "airbnb"],
        "resort_info": ["about breeze", "resort info", "resort details", "resort information", "what is breeze", "tell me about breeze"],
    }

    matched_key = None
    for key, keywords in menu_prompts.items():
        if any(keyword in raw for keyword in keywords):
            matched_key = key
            break

    if not matched_key:
        return None

    response_block = responses.get(matched_key, {})
    template = response_block.get("template") or response_block.get("message") or ""
    if not template:
        return None

    text = render(template, ctx)
    menu_nudge = {
        "tagalog": "\n\nTip: Puwede mo ring i-type ang MENU para mas mabilis mong makita ang tamang section.",
        "taglish": "\n\nTip: You can also type MENU para mas mabilis mong makita ang tamang section.",
        "english": "\n\nTip: You can also type MENU to jump straight to the right section."
    }
    return {
        "text": f"{text}{menu_nudge.get(language_mode, menu_nudge['english'])}",
        "key": matched_key,
        "quick_replies": response_block.get("quick_replies", ["ðŸ  MENU"])
    }

def is_main_menu_request(input_value: str) -> bool:
    normalized = (input_value or "").strip().upper()
    if not normalized:
        return False

    direct_matches = {
        "GET_STARTED",
        "START",
        "MAIN MENU",
        "MAIN_MENU",
        "MENU",
        "BACK",
        "ðŸ ",
        "HELLO",
        "HI",
    }
    return normalized in direct_matches

# â”€â”€â”€ ðŸ” DEDUPLICATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def is_bot_resume_request(input_value: str) -> bool:
    normalized = normalize_menu_text(input_value).upper()
    resume_matches = {
        "GET STARTED",
        "START",
        "MAIN MENU",
        "MENU",
        "BACK",
        "HELLO",
        "HI",
        "BOOK NOW",
        "WEBSITE",
        "RESUME",
        "BOT",
    }
    return normalized in resume_matches

import time as _time
def is_duplicate(sender_id: str, message: str) -> bool:
    now  = _time.time()
    last = DEDUP_WINDOW.get(sender_id)
    if last and last[0] == message and now - last[1] < TEXT_DEDUP_WINDOW_SECONDS:
        return True
    DEDUP_WINDOW[sender_id] = (message, now)
    return False

def build_messenger_delivery_key(sender_id: str, event: dict, msg: dict | None = None, postback: dict | None = None) -> str | None:
    """Return a stable key for one Meta delivery when Meta provides enough identity."""
    mid = (msg or {}).get("mid")
    if mid:
        return f"message:{sender_id}:{mid}"
    postback_mid = (postback or {}).get("mid")
    if postback_mid:
        return f"postback:{sender_id}:{postback_mid}"
    return None

def is_event_for_configured_page(event: dict, msg: dict | None = None) -> bool:
    if not FB_PAGE_ID:
        return True

    sender_id = str(event.get("sender", {}).get("id") or "")
    recipient_id = str(event.get("recipient", {}).get("id") or "")

    if msg and msg.get("is_echo"):
        return sender_id == FB_PAGE_ID

    return recipient_id == FB_PAGE_ID

def is_duplicate_delivery(delivery_key: str | None) -> bool:
    if not delivery_key:
        return False
    now = _time.time()
    stale_keys = [
        key for key, seen_at in RECENT_MESSENGER_DELIVERIES.items()
        if now - seen_at > DELIVERY_DEDUP_TTL_SECONDS
    ]
    for key in stale_keys:
        RECENT_MESSENGER_DELIVERIES.pop(key, None)
    if delivery_key in RECENT_MESSENGER_DELIVERIES:
        return True
    RECENT_MESSENGER_DELIVERIES[delivery_key] = now
    return False

# â”€â”€â”€ ðŸŒ WEBHOOK VERIFICATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/messenger")
async def verify_messenger(request: Request):
    if request.query_params.get("hub.mode") == "subscribe" and request.query_params.get("hub.verify_token") == FB_VERIFY_TOKEN:
        return Response(content=request.query_params.get("hub.challenge"), media_type="text/plain")
    return Response(content="Verification Failed", status_code=403)

# â”€â”€â”€ ðŸ“¨ WEBHOOK RECEIVER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/messenger")
async def handle_messenger_webhook(request: Request, background_tasks: BackgroundTasks):
    payload = await request.json()
    if payload.get("object") == "page":
        for entry in payload.get("entry", []):
            for event in entry.get("messaging", []):
                sender_id = event["sender"]["id"]
                if "message" in event:
                    msg           = event["message"]
                    if not is_event_for_configured_page(event, msg):
                        print(
                            "[FB_WEBHOOK] Ignoring event for non-configured page "
                            f"sender={event.get('sender', {}).get('id')} "
                            f"recipient={event.get('recipient', {}).get('id')} "
                            f"configured_page={FB_PAGE_ID}"
                        )
                        continue
                    delivery_key  = build_messenger_delivery_key(sender_id, event, msg=msg)
                    if is_duplicate_delivery(delivery_key):
                        print(f"DEBUG: [DEDUP] Ignoring duplicate Messenger delivery {delivery_key}")
                        continue
                    
                    # ðŸ“¢ Detect Manual Replies from Meta Business Suite (Echoes)
                    if msg.get("is_echo"):
                        recipient_id = event["recipient"]["id"] # This is the Guest ID
                        text_cmd     = msg.get("text", "").strip().lower()
                        app_id       = msg.get("app_id")
                        print(f"DEBUG: [ECHO] Admin message to {recipient_id}: '{text_cmd}'")

                        if app_id:
                            print(f"DEBUG: [ECHO] Ignoring app-sent echo for {recipient_id} from app_id={app_id}")
                            continue

                        if text_cmd in ["!pause", "!stop", "!quiet"]:
                            set_conversation_pause(recipient_id, True, duration_hours=2, reason="admin_command_pause", category="MANUAL_ACTIVE", priority="high", admin_reply=True)
                            await send_message(recipient_id, "â¸ï¸ Chatbot paused manually.")
                            print(f"â¸ï¸ [COMMAND] Chatbot paused by admin for {recipient_id}")
                            continue
                        
                        if text_cmd in ["!resume", "!start", "!bot"]:
                            set_conversation_pause(recipient_id, False)
                            await send_message(recipient_id, "â–¶ï¸ Chatbot resumed manually.")
                            print(f"â–¶ï¸ [COMMAND] Chatbot resumed by admin for {recipient_id}")
                            continue

                        print(f"ðŸ“¢ [ECHO] Admin manual reply detected for {recipient_id}. Auto-pausing.")
                        archive_chat_turn(recipient_id, "[ADMIN_ECHO]", msg.get("text", ""), "admin_echo", False)
                        set_conversation_pause(recipient_id, True, duration_hours=2, reason="admin_manual_reply", category="MANUAL_ACTIVE", priority="high", admin_reply=True)
                        continue

                    text          = msg.get("text", "")
                    attachments   = msg.get("attachments", [])
                    image_url     = None
                    if attachments:
                        for att in attachments:
                            if att.get("type") == "image":
                                image_url = att.get("payload", {}).get("url")
                                break
                    
                    classification = categorize_inquiry(text, "", bool(image_url))
                    update_conversation_metadata(sender_id, classification["category"], classification["priority"])
                    quick_payload = msg.get("quick_reply", {}).get("payload", "").replace("MENU_", "").replace("_", " ")
                    background_tasks.add_task(process_messenger_event, sender_id, text, quick_payload, request, image_url)
                elif "postback" in event:
                    postback = event["postback"]
                    if not is_event_for_configured_page(event):
                        print(
                            "[FB_WEBHOOK] Ignoring postback for non-configured page "
                            f"sender={event.get('sender', {}).get('id')} "
                            f"recipient={event.get('recipient', {}).get('id')} "
                            f"configured_page={FB_PAGE_ID}"
                        )
                        continue
                    delivery_key = build_messenger_delivery_key(sender_id, event, postback=postback)
                    if is_duplicate_delivery(delivery_key):
                        print(f"DEBUG: [DEDUP] Ignoring duplicate Messenger delivery {delivery_key}")
                        continue
                    pb = postback.get("payload", "").replace("MENU_", "").replace("_", " ")
                    classification = categorize_inquiry("", pb, False)
                    update_conversation_metadata(sender_id, classification["category"], classification["priority"])
                    background_tasks.add_task(process_messenger_event, sender_id, "", pb, request)
    return Response(content="EVENT_RECEIVED")

# â”€â”€â”€ âš™ï¸ MAIN EVENT PROCESSOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def _parse_pht_timestamp(raw_str: str) -> datetime | None:
    if not raw_str: return None
    try:
        # Format used in state_service.py: "%Y-%m-%d %I:%M:%S %p PHT"
        return datetime.strptime(raw_str, "%Y-%m-%d %I:%M:%S %p PHT").replace(tzinfo=PH_TIMEZONE)
    except:
        return None

async def process_messenger_event(sender_id: str, message_text: str = "", postback_payload: str = "", request: Request = None, image_url: str = None):
    current_time = _time.time()

    if sender_id in USER_COOLDOWN:
        if current_time - USER_COOLDOWN[sender_id] < MIN_COOLDOWN_SECONDS: return
    USER_COOLDOWN[sender_id] = current_time

    if message_text and is_duplicate(sender_id, message_text):
        return

    incoming_text = message_text or postback_payload or (f"[Receipt Image] {image_url}" if image_url else "[Attachment]")
    archive_chat_turn(sender_id, incoming_text, "", "incoming_event", False)
    save_user_to_history(sender_id, message_text or postback_payload)

    kb        = await load_knowledge_base()
    responses = await load_menu_responses()
    ctx       = build_context(kb, responses)
    language_mode = detect_language_mode(message_text or postback_payload or "")
    input_str = (postback_payload or message_text or "").upper()
    classification = categorize_inquiry(message_text, postback_payload, bool(image_url))
    update_conversation_metadata(sender_id, classification["category"], classification["priority"])
    await maybe_apply_ai_triage(sender_id, message_text or postback_payload, classification, bool(image_url))

    # --- GLOBAL MASTER SWITCH ---
    try:
        settings_url = f"{HUB_URL}/api/v1/admin/settings"
        async with httpx.AsyncClient() as client:
            # We use a 5s timeout to avoid hanging if the Hub is slow
            resp = await client.get(settings_url, headers={"Authorization": f"Bearer {INTERNAL_AUTH_TOKEN}"}, timeout=5.0)
            if resp.status_code == 200:
                settings = resp.json()
                if settings.get("is_bot_enabled") == "false":
                    print(f"ðŸ›‘ [MASTER SWITCH] Bot is globally DISABLED. Ignoring event from {sender_id}.")
                    return
    except Exception as e:
        print(f"âš ï¸ [MASTER SWITCH] Failed to check global status: {e}. Defaulting to ENABLED.")

    # ðŸ›‘ Pause/Manual Handoff Check
    state = get_conversation_state(sender_id)
    print(f"DEBUG: [PAUSE_CHECK] state for {sender_id}: {state}")

    if state.get("is_paused"):
        print(f"DEBUG: [PAUSE_CHECK] {sender_id} is currently PAUSED")
        manual_until = _parse_pht_timestamp(state.get("manual_until"))
        now = datetime.now(PH_TIMEZONE)
        if is_bot_resume_request(input_str):
            print(f"RESUME: Guest {sender_id} requested bot/menu while paused.")
            set_conversation_pause(sender_id, False)
            state = get_conversation_state(sender_id)
        elif state.get("manual_active") or (manual_until and manual_until > now):
            print(f"PAUSED: Manual lock active for {sender_id} until {state.get('manual_until')}")
            archive_chat_turn(sender_id, message_text or postback_payload, "[PAUSED - HUMAN AGENT ACTIVE]", "manual_override_active", False)
            return
        if manual_until and manual_until <= now:
            print(f"TIMEOUT: Manual lock expired for {sender_id}. Resuming bot.")
            set_conversation_pause(sender_id, False)
            state = get_conversation_state(sender_id)
        # Auto-resume if user triggers Menu or Start
        if is_main_menu_request(input_str):
            print(f"ðŸ”“ [RESUME] Guest {sender_id} requested menu. Resuming chatbot.")
            set_conversation_pause(sender_id, False)
        else:
            # Check for 1-hour timeout
            raw_paused_at = state.get("paused_at")
            paused_at = _parse_pht_timestamp(raw_paused_at)
            print(f"DEBUG: [PAUSE_CHECK] raw_paused_at: {raw_paused_at} | parsed: {paused_at}")

            if paused_at:
                now = datetime.now(PH_TIMEZONE)
                diff = now - paused_at
                print(f"DEBUG: [PAUSE_CHECK] Time since pause: {diff} (limit: 1hr)")
                
                if diff > timedelta(hours=1):
                    print(f"â° [TIMEOUT] Pause expired for {sender_id} (1hr limit). Resuming.")
                    set_conversation_pause(sender_id, False)
                else:
                    print(f"â¸ï¸ [PAUSED] Ignoring message from {sender_id}: {message_text[:50]}")
                    archive_chat_turn(sender_id, message_text or postback_payload, "[PAUSED - ADMIN ACTIVE]", "handover_active", False)
                    return
            else:
                print(f"âš ï¸ [PAUSE_CHECK] No valid timestamp for {sender_id}. Safety unpause.")
                set_conversation_pause(sender_id, False)

    if image_url:
        receipt_check = await verify_receipt_with_vision(image_url)
        receipt_type = str(receipt_check.get("classification") or receipt_check.get("status") or "").lower()
        if receipt_check.get("status") == "verified_payment_receipt" or receipt_type == "payment_receipt":
            m = responses.get("receipt_acknowledgement", {})
            text = render(m.get("template", "Thanks for sending your receipt. Our team will verify your payment and update your booking status within 24 hours."), ctx)
            await send_message(sender_id, text)
            update_conversation_metadata(sender_id, "PAYMENT_SENT", "high", source="ai", ai_confidence=receipt_check.get("confidence"), ai_reason=receipt_check.get("reason"), ai_suggested_action="Verify payment receipt in admin.")
            activate_manual_handoff(sender_id, "[Payment Receipt Image]", text, "payment_receipt", "high", "messenger")
            archive_chat_turn(sender_id, f"[Payment Receipt Image] {image_url}", text, "payment_receipt", True)
            return
        if receipt_type in {"booking_acknowledgement", "acknowledgement_receipt"}:
            text = build_payment_receipt_request_text(language_mode)
            await send_quick_replies(sender_id, text, ["Payment Inquiry", "Talk to Guest Services", "MENU"])
            update_conversation_metadata(sender_id, "PAYMENT_SENT", "high", source="ai", ai_confidence=receipt_check.get("confidence"), ai_reason="booking acknowledgement image, payment proof still needed", ai_suggested_action="Ask guest for actual payment screenshot.")
            archive_chat_turn(sender_id, f"[Booking Acknowledgement Image] {image_url}", text, "booking_acknowledgement_image", True)
            return
        if receipt_type in {"not_receipt", "non_receipt"}:
            text = build_invalid_receipt_image_text(language_mode)
            await send_quick_replies(sender_id, text, ["Payment Inquiry", "MENU"])
            update_conversation_metadata(sender_id, "LOW_PRIORITY_FAQ", "normal", source="ai", ai_confidence=receipt_check.get("confidence"), ai_reason=receipt_check.get("reason"), ai_suggested_action="Wait for valid payment proof.")
            archive_chat_turn(sender_id, f"[Non Receipt Image] {image_url}", text, "invalid_receipt_image", False)
            return

    if "PAYMENT INQUIRY" in input_str:
        m = responses.get("payment_inquiry", {})
        text = render(m.get("template", ""), ctx)
        activate_manual_handoff(sender_id, message_text or postback_payload, text, "payment_inquiry", "medium", "messenger")
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["ðŸ“ž Talk to Guest Services", "â¬…ï¸ BACK"]))
        archive_chat_turn(sender_id, message_text or postback_payload, text, "payment_inquiry", True)
        return

    early_handoff = detect_handoff_need(message_text or postback_payload)
    if early_handoff and "MENU" not in input_str and "BACK" not in input_str:
        text = build_human_handoff_text(language_mode)
        activate_manual_handoff(sender_id, message_text or postback_payload, text, early_handoff["reason"], early_handoff["urgency"], "messenger")
        await send_quick_replies(sender_id, text, ["MENU", "Book Now"])
        archive_chat_turn(sender_id, message_text or postback_payload, text, "human_handoff", True)
        return

    # â”€â”€ ðŸ  MAIN MENU â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if is_main_menu_request(input_str):
        clear_history(sender_id)
        first_name = await get_fb_first_name(sender_id)
        m = responses.get("main_menu", {})
        if first_name:
            text = render(m.get("greeting_template", "Welcome to Amalfi Resort! ðŸï¸"), {**ctx, "first_name": first_name})
        else:
            text = m.get("greeting_no_name", "Welcome to Amalfi Resort! ðŸï¸")
        await send_quick_replies(sender_id, text, m.get("quick_replies", []))
        archive_chat_turn(sender_id, message_text or postback_payload, text, "main_menu", False)
        return

    if "STAY OPTIONS" in input_str:
        m = responses.get("stay_options", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["ðŸ›ï¸ Rooms & Rates", "â¬…ï¸ BACK"]))
        return

    if "DAY TOUR & CAMPING" in input_str:
        m = responses.get("day_tour_and_camping", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["ðŸŽŸï¸ Day Tours", "â›º Tent Pitching", "â¬…ï¸ BACK"]))
        return

    if "RENTALS & ADD-ONS" in input_str or "RENTALS & ADD ONS" in input_str:
        m = responses.get("rentals_and_add_ons", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["ðŸ³ Kitchen Rental", "ðŸ–ï¸ Amenities", "â¬…ï¸ BACK"]))
        return

    if "RESORT INFO" in input_str:
        m = responses.get("resort_info", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        archive_chat_turn(sender_id, message_text or postback_payload, text, "resort_info", False)
        return

    # â”€â”€ 1. â„¹ï¸ RESORT INFO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "RESORT INFO" in input_str:
        m    = responses.get("resort_info", {})
        text = build_human_handoff_text(language_mode)
        activate_manual_handoff(sender_id, message_text or postback_payload, text, "guest_requested_human", "high", "messenger")
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        return

    # â”€â”€ 2. ðŸ›ï¸ ROOMS & RATES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "ROOMS & RATES" in input_str or "OTHER UNITS" in input_str:
        m = responses.get("rooms_and_rates", {})
        await send_message(sender_id, m.get("intro_message", "ðŸï¸ Our Accommodations:"))
        elements = build_room_rate_elements(kb)
        if elements:
            await send_generic_carousel(sender_id, elements)
        else:
            await send_message(sender_id, build_room_rates_text(kb))
        await send_quick_replies(sender_id, m.get("outro_message", "Which unit catches your eye? ðŸ–ï¸"), m.get("quick_replies", []))
        return

    # â”€â”€ 3. ðŸŽŸï¸ DAY TOURS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "DAY TOURS" in input_str:
        m    = responses.get("day_tours", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        return

    # â”€â”€ 3.1 ðŸ³ KITCHEN RENTAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "KITCHEN RENTAL" in input_str:
        m    = responses.get("kitchen_rental", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        return

    # â”€â”€ 3.2 â›º TENT PITCHING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "TENT PITCHING" in input_str:
        m    = responses.get("tent_pitching", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        return

    # â”€â”€ 4. ðŸ–ï¸ AMENITIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "AMENITIES" in input_str:
        m    = responses.get("amenities", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        return

    # â”€â”€ 5. ðŸ“œ RULES & POLICIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "RULES & POLICIES" in input_str or "POLICIES" in input_str:
        m    = responses.get("rules_and_policies", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        return

    # â”€â”€ 6. ðŸ“ HOW TO GET HERE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "TALK TO AGENT" in input_str or "TALK TO GUEST SERVICES" in input_str:
        m = responses.get("human_handoff", {})
        text = build_human_handoff_text(language_mode)
        activate_manual_handoff(sender_id, message_text or postback_payload, text, "guest_requested_human", "high", "messenger")
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["MENU"]))
        archive_chat_turn(sender_id, message_text or postback_payload, text, "human_handoff", True)
        return

    if "HOW TO GET HERE" in input_str or "DIRECTIONS" in input_str or "LOCATION" in input_str or "MAP" in input_str:
        m    = responses.get("directions", {})
        text = render(m.get("template", ""), ctx)
        await send_button_template(sender_id, text, m.get("map_button_label", "ðŸ“ Open in Google Maps"), ctx.get("map_link", "#"))
        return

    # ðŸ“ž TALK TO GUEST SERVICES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "TALK TO GUEST SERVICES" in input_str:
        m    = responses.get("human_handoff", {})
        text = build_human_handoff_text(language_mode)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["ðŸ  MENU"]))
        return

    # â”€â”€ 7. ðŸ“ž CONTACT & SOCIALS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "TALK TO GUEST SERVICES" in input_str:
        m    = responses.get("human_handoff", {})
        text = build_human_handoff_text(language_mode)
        activate_manual_handoff(sender_id, message_text or postback_payload, text, "guest_requested_human", "high", "messenger")
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["MENU"]))
        archive_chat_turn(sender_id, message_text or postback_payload, text, "human_handoff", True)
        return

    if "CONTACT" in input_str or "SOCIALS" in input_str or "SOCIAL" in input_str:
        m    = responses.get("contact_and_socials", {})
        text = render(m.get("template", ""), ctx)
        await send_quick_replies(sender_id, text, m.get("quick_replies", ["â¬…ï¸ BACK"]))
        return

    # â”€â”€ 8. ðŸŒ BOOK NOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if "BOOK NOW" in input_str or "WEBSITE" in input_str:
        m = responses.get("book_now", {})
        await send_button_template(sender_id, m.get("message", "Ready to book? ðŸï¸"), m.get("button_label", "ðŸŒ Visit Booking Site"), BOOKING_URL)
        return

    # â”€â”€ ðŸ¤– AI LAYER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    structured_reply = resolve_structured_menu_response(message_text, responses, ctx, language_mode) if message_text and is_explicit_menu_selection(message_text) else None
    if structured_reply:
        if structured_reply["key"] == "payment_inquiry":
            create_handoff_alert(sender_id, message_text, structured_reply["text"], "payment_inquiry", "medium", "messenger")
        await send_quick_replies(sender_id, structured_reply["text"], structured_reply["quick_replies"])
        archive_chat_turn(sender_id, message_text, structured_reply["text"], structured_reply["key"], structured_reply["key"] == "payment_inquiry")
        return

    handoff_request = detect_handoff_need(message_text)
    if handoff_request:
        text = build_human_handoff_text(language_mode)
        activate_manual_handoff(sender_id, message_text, text, handoff_request["reason"], handoff_request["urgency"], "messenger")
        await send_quick_replies(sender_id, text, ["MENU", "Book Now"])
        archive_chat_turn(sender_id, message_text, text, "human_handoff", True)
        return

    if message_text and needs_combo_booking_handoff(message_text, kb):
        reply = build_combo_booking_handoff_text(language_mode)
        activate_manual_handoff(sender_id, message_text, reply, "combo_booking", "medium", "messenger")
        await send_quick_replies(sender_id, reply, ["ðŸ“ž Talk to Guest Services", "ðŸŒ Book Now", "ðŸ  MENU"])
        archive_chat_turn(sender_id, message_text, reply, "combo_booking", True)
        return

    if message_text and should_prompt_for_availability_details(message_text):
        reply = build_availability_details_prompt(language_mode)
        await send_quick_replies(sender_id, reply, ["Book Now", "Talk to Guest Services", "MENU"])
        save_to_history(sender_id, message_text, reply)
        archive_chat_turn(sender_id, message_text, reply, "availability_needs_dates", False)
        return

    if not is_resort_related_message(message_text, postback_payload, bool(image_url)):
        out_text = render(responses.get("out_of_scope", {}).get("template", ""), ctx) or build_out_of_scope_text(language_mode)
        await send_quick_replies(sender_id, out_text, responses.get("out_of_scope", {}).get("quick_replies", ["MENU", "Book Now"]))
        archive_chat_turn(sender_id, message_text or postback_payload, out_text, "out_of_scope", False)
        return

    count = get_daily_ai_count(sender_id)
    ai_limit = get_ai_daily_limit(classification, message_text or postback_payload, bool(image_url))
    if count >= ai_limit:
        m = responses.get("session_limit_reached", {})
        await send_button_template(
            sender_id,
            render(m.get("message", ""), ctx),
            m.get("button_label", "ðŸŒ Book at Amalfi Resort"),
            BOOKING_URL
        )
        await asyncio.sleep(0.5)
        await send_quick_replies(
            sender_id,
            m.get("followup_message", "ðŸ‘‡ Tap MENU to explore!"),
            m.get("followup_quick_replies", ["ðŸ  MENU"])
        )
        return

    USER_MESSAGE_COUNTS[sender_id] = USER_MESSAGE_COUNTS.get(sender_id, 0) + 1
    if mark_seen: await mark_seen(sender_id)
    if typing_on: await typing_on(sender_id)

    # ðŸ—“ï¸ Availability Intelligence
    history = get_history(sender_id)
    availability_context = ""
    inquiry_message, carried_room_preference = build_contextual_inquiry_message(message_text, history)
    hub_analysis = await fetch_hub_inquiry_analysis(inquiry_message) if inquiry_message else None
    if hub_analysis:
        availability_context = "\n\n" + format_hub_analysis_for_ai(hub_analysis, carried_room_preference)
        print(f"[INQUIRY BRAIN] Hub analysis loaded for {sender_id}")
    elif message_text and looks_like_availability_question(message_text):
        print(f"ðŸ“… [AVAILABILITY] Date question detected from {sender_id}")
        dates = await extract_dates_with_ai(inquiry_message, kb)
        if dates:
            print(f"ðŸ“… [AVAILABILITY] Fetching: {dates['check_in']} â†’ {dates['check_out']}")
            avail_data = await fetch_availability(dates["check_in"], dates["check_out"])
            if avail_data:
                availability_context = "\n\n" + format_availability_for_ai(avail_data)
                print(f"âœ… [AVAILABILITY] Got data for {dates['check_in']}")

    # Build AI prompt from editable file
    raw_prompt    = load_ai_prompt()
    context_prompt = build_ai_prompt(raw_prompt, kb, availability_context, language_mode)

    bot_response = await get_ai_response(message_text or "[Image]", history, context_prompt, language_mode, image_url)
    increment_daily_ai_count(sender_id)

    # ðŸ§¾ Vision Intent Handler: Payment Receipt
    if bot_response and bot_response.intent == "payment_receipt":
        m = responses.get("receipt_acknowledgement", {})
        text = render(m.get("template", "Thanks for sending your receipt! ðŸŒŠ Our team will verify your payment within 24 hours."), ctx)
        await send_message(sender_id, text)
        activate_manual_handoff(sender_id, message_text or "[Receipt Image]", text, "payment_receipt", "high", "messenger")
        archive_chat_turn(sender_id, message_text or "[Receipt Image]", text, "payment_receipt", True)
        return

    m           = responses.get("ai_fallback", {})
    # Render fallback if no response, or if intent is unclear
    fallback_text = build_localized_fallback_text(language_mode)
    actual_text   = sanitize_guest_reply(bot_response.text if bot_response else fallback_text)
    print(f"ðŸ¤– [AI]: {actual_text[:100]}")

    if typing_off: await typing_off(sender_id)

    if bot_response and bot_response.intent == "booking_redirect":
        await send_button_template(sender_id, actual_text, "ðŸŒ Book Now", BOOKING_URL)
    elif not bot_response:
        await send_quick_replies(sender_id, actual_text, m.get("quick_replies", ["MENU", "ðŸŒ Book Now"]))
    else:
        await send_message(sender_id, actual_text)

    if message_text and bot_response:
        save_to_history(sender_id, message_text, actual_text)

    archive_chat_turn(sender_id, message_text, actual_text, "ai_inquiry" if bot_response else "ai_fallback", False)


# â”€â”€â”€ ðŸ–¥ï¸ WEB CHAT ENDPOINT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/chat")
async def handle_web_chat(request: Request):
    payload      = await request.json()
    message_text = payload.get("message", "")
    sender_id    = payload.get("sender_id", "WEB_GUEST")
    history      = payload.get("history", [])
    language_mode = detect_language_mode(message_text)

    kb = await load_knowledge_base()
    responses = await load_menu_responses()
    ctx = build_context(kb, responses)

    if is_main_menu_request(message_text):
        m = responses.get("main_menu", {})
        text = m.get("greeting_no_name", "Mabuhay! Welcome to Amalfi Resort. Tap a menu option below.")
        archive_chat_turn(sender_id, message_text, text, "web_main_menu", False)
        return {
            "response": text,
            "intent": "main_menu",
            "quick_replies": m.get("quick_replies", []),
            "requires_human": False,
        }

    if normalize_menu_text(message_text) in {"rooms & rates", "rooms rates", "rooms and rates"}:
        m = responses.get("rooms_and_rates", {})
        text = build_room_rates_text(kb)
        archive_chat_turn(sender_id, message_text, text, "web_rooms_and_rates", False)
        return {
            "response": text,
            "intent": "rooms_and_rates",
            "quick_replies": m.get("quick_replies", ["Book Now", "Rules & Policies", "BACK"]),
            "cards": build_room_rate_elements(kb),
            "requires_human": False,
        }

    structured_reply = resolve_structured_menu_response(message_text, responses, ctx, language_mode) if message_text and is_explicit_menu_selection(message_text) else None
    if structured_reply:
        requires_human = structured_reply["key"] == "payment_inquiry"
        if requires_human:
            create_handoff_alert(sender_id, message_text, structured_reply["text"], "payment_inquiry", "medium", "web")
        archive_chat_turn(sender_id, message_text, structured_reply["text"], structured_reply["key"], requires_human)
        return {
            "response": structured_reply["text"],
            "intent": structured_reply["key"],
            "quick_replies": structured_reply["quick_replies"],
            "requires_human": requires_human,
        }

    handoff_request = detect_handoff_need(message_text)
    if handoff_request:
        text = build_human_handoff_text(language_mode)
        create_handoff_alert(sender_id, message_text, text, handoff_request["reason"], handoff_request["urgency"], "web")
        archive_chat_turn(sender_id, message_text, text, "web_human_handoff", True)
        return {"response": text, "intent": "human_handoff", "requires_human": True}

    if needs_combo_booking_handoff(message_text, kb):
        reply = build_combo_booking_handoff_text(language_mode)
        create_handoff_alert(sender_id, message_text, reply, "combo_booking", "medium", "web")
        archive_chat_turn(sender_id, message_text, reply, "web_combo_booking", True)
        return {
            "response": reply,
            "intent": "combo_booking",
            "requires_human": True,
            "quick_replies": ["ðŸ“ž Talk to Guest Services", "ðŸŒ Book Now", "MENU"],
        }

    if message_text and looks_like_availability_question(message_text) and not has_date_hint(message_text):
        reply = build_availability_details_prompt(language_mode)
        archive_chat_turn(sender_id, message_text, reply, "web_availability_needs_dates", False)
        return {
            "response": reply,
            "intent": "availability_needs_dates",
            "requires_human": False,
            "quick_replies": ["Book Now", "Talk to Guest Services", "MENU"],
        }

    if not is_resort_related_message(message_text, "", False):
        out_text = render(responses.get("out_of_scope", {}).get("template", ""), ctx) or build_out_of_scope_text(language_mode)
        archive_chat_turn(sender_id, message_text, out_text, "web_out_of_scope", False)
        return {
            "response": out_text,
            "intent": "out_of_scope",
            "requires_human": False,
            "quick_replies": responses.get("out_of_scope", {}).get("quick_replies", ["MENU", "Book Now"]),
        }

    classification = categorize_inquiry(message_text, "", False)
    if get_daily_ai_count(sender_id) >= get_ai_daily_limit(classification, message_text, False):
        cap_text, _ = build_soft_cap_message(language_mode)
        return {"response": cap_text, "intent": "soft_cap"}

    inquiry_message, carried_room_preference = build_contextual_inquiry_message(message_text, history)
    availability_context = ""
    hub_analysis = await fetch_hub_inquiry_analysis(inquiry_message) if inquiry_message else None
    if hub_analysis:
        availability_context = "\n\n" + format_hub_analysis_for_ai(hub_analysis, carried_room_preference)
    elif looks_like_availability_question(message_text):
        dates = await extract_dates_with_ai(inquiry_message, kb)
        if dates:
            avail_data = await fetch_availability(dates["check_in"], dates["check_out"])
            if avail_data:
                availability_context = "\n\n" + format_availability_for_ai(avail_data)

    raw_prompt     = load_ai_prompt()
    context_prompt = build_ai_prompt(raw_prompt, kb, availability_context, language_mode)

    bot_response = await get_ai_response(message_text, history, context_prompt, language_mode)
    increment_daily_ai_count(sender_id)
    if not bot_response:
        fallback = build_localized_fallback_text(language_mode)
        archive_chat_turn(sender_id, message_text, fallback, "web_ai_fallback", False)
        return {"response": fallback, "intent": "ai_fallback", "requires_human": False}
        return {"response": "Our concierge is currently reflecting. Please try again or visit our booking portal. ðŸï¸"}

    if bot_response.intent == "booking_redirect":
        return {"response": sanitize_guest_reply(bot_response.text), "intent": "booking_redirect", "booking_url": BOOKING_URL}

    safe_text = sanitize_guest_reply(bot_response.text)
    archive_chat_turn(sender_id, message_text, safe_text, "web_chat", False)
    return {"response": safe_text, "intent": bot_response.intent}
