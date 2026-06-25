from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import csv
import gzip
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

# Load from root .env for local monorepo runs, fallback to local .env for
# standalone production runs. Docker Compose may inject these without a file.
_root_env = Path(__file__).parent.parent / ".env"
_local_env = Path(__file__).parent / ".env"
_env_path = _root_env if _root_env.exists() else _local_env
ENV_FILE_SOURCE = str(_env_path) if _env_path.exists() else "process-environment"
load_dotenv(dotenv_path=_env_path if _env_path.exists() else None)
from app.api import webhooks
from app.services.state_service import list_chatbot_alerts, update_chatbot_alert_status, get_conversation_state, set_conversation_pause, list_conversation_states, purge_conversation_records, purge_all_monitor_records, update_conversation_metadata
from app.services.messenger_service import send_message
from app.services.log_service import archive_chat_turn

# For getting the API key and setting it globally, though Gemini lets you pass it directly.
APP_NAME = os.getenv("APP_NAME", "Project Amalfi - Chatbot Agent")
ALLOWED_ORIGINS = ["*"] # Adjust in production
PH_TIMEZONE = timezone(timedelta(hours=8))
CHAT_LOG_FIELDS = ["Timestamp", "Sender ID", "User Message", "Bot Answer", "Intent", "Is Urgent"]
DEMO_CHAT_SENDERS = ("CHATBOT_DEMO_BOOKING_LEAD", "CHATBOT_DEMO_LOCATION_FAQ")
RUNTIME_ROOT = Path(os.getenv("RUNTIME_PATH", Path(__file__).parent.parent / "amalfi-system" / "runtime"))
REQUIRED_ENV_VARS = [
    "HUB_URL",
    "INTERNAL_AUTH_TOKEN",
    "FB_VERIFY_TOKEN",
    "FB_PAGE_ID",
    "FB_PAGE_ACCESS_TOKEN",
]


def _missing_required_env() -> list[str]:
    return [name for name in REQUIRED_ENV_VARS if not os.getenv(name)]

app = FastAPI(
    title=APP_NAME,
    description="The Edge AI Chatbot webhook handler connecting to Messenger and Instagram.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhooks.router, prefix="/webhook", tags=["Webhook Handlers"])

# Compatibility for existing Meta callback URLs that include the public
# gateway prefix: /chatbot/webhook/messenger.
app.include_router(webhooks.router, prefix="/chatbot/webhook", tags=["Webhook Handlers"])


def _chat_log_path() -> Path:
    return Path(os.getenv("CHATBOT_LOG_FILE", RUNTIME_ROOT / "chatbot" / "logs" / "chat_archive.csv"))


def _chat_archive_dir() -> Path:
    return Path(os.getenv("CHATBOT_ARCHIVE_DIR", RUNTIME_ROOT / "chatbot" / "archive"))


def _infer_chat_source(sender_id: str) -> str:
    return "web" if str(sender_id or "").upper().startswith("WEB_") else "messenger"


def _truthy(value) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def _is_test_sender(sender_id: str) -> bool:
    normalized = str(sender_id or "").strip().upper()
    return normalized.startswith((
        "STRESS_",
        "SMOKE_",
        "TEST_",
        "DUMMY_",
        "LOCAL_",
        "FAKE_",
        "MOCK_",
        "DIAGNOSTIC_",
        "WEB_DIAGNOSTIC",
        "QUALITY_BOT",
        "SPAM_USER_",
    ))


def _is_test_chat_row(row: dict) -> bool:
    text = " ".join(
        str(row.get(field) or "")
        for field in ("Sender ID", "User Message", "Bot Answer", "Intent")
    ).lower()
    return _is_test_sender(row.get("Sender ID") or "") or any(
        marker in text
        for marker in (
            "stress test",
            "static stress response",
            "smoke manual override",
            "dummy paid guest",
            "local dummy",
            "testing connection",
            "diagnostic",
        )
    )


def _is_test_alert(alert: dict) -> bool:
    text = " ".join(
        str(alert.get(field) or "")
        for field in ("sender_id", "user_message", "bot_answer", "escalation_reason")
    ).lower()
    return _is_test_sender(alert.get("sender_id") or "") or any(
        marker in text
        for marker in ("stress test", "static stress response", "smoke manual override", "local dummy", "diagnostic")
    )


def _parse_chat_timestamp(raw: str) -> datetime:
    value = str(raw or "").strip()
    if not value:
        return datetime.min.replace(tzinfo=PH_TIMEZONE)

    for pattern, tz in (
        ("%Y-%m-%d %I:%M:%S %p PHT", PH_TIMEZONE),
        ("%Y-%m-%d %H:%M:%S UTC", timezone.utc),
        ("%Y-%m-%d %H:%M:%S", PH_TIMEZONE),
    ):
        try:
            parsed = datetime.strptime(value, pattern)
            return parsed.replace(tzinfo=tz).astimezone(PH_TIMEZONE)
        except ValueError:
            continue

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=PH_TIMEZONE)
        return parsed.astimezone(PH_TIMEZONE)
    except ValueError:
        return datetime.min.replace(tzinfo=PH_TIMEZONE)


def _format_chat_timestamp(raw: str) -> str:
    parsed = _parse_chat_timestamp(raw)
    if parsed == datetime.min.replace(tzinfo=PH_TIMEZONE):
        return str(raw or "")
    return parsed.strftime("%Y-%m-%d %I:%M:%S %p PHT")


def _load_chat_rows() -> list[dict]:
    log_path = _chat_log_path()
    if not log_path.exists():
        return []

    try:
        with open(log_path, mode='r', encoding='utf-8') as f:
            return list(csv.DictReader(f))
    except Exception:
        return []


def _backup_chat_log() -> str | None:
    log_path = _chat_log_path()
    if not log_path.exists():
        return None
    stamp = datetime.now(PH_TIMEZONE).strftime("%Y%m%d_%H%M%S")
    backup_path = log_path.with_name(f"{log_path.stem}.backup_{stamp}{log_path.suffix}")
    backup_path.write_bytes(log_path.read_bytes())
    return str(backup_path)


def _write_chat_rows(rows: list[dict]) -> None:
    log_path = _chat_log_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CHAT_LOG_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _append_chat_rows(rows: list[dict]) -> None:
    existing_rows = _load_chat_rows()
    _write_chat_rows([*existing_rows, *rows])


def _archive_month_key(row: dict) -> str:
    parsed = _parse_chat_timestamp(row.get("Timestamp", ""))
    if parsed == datetime.min.replace(tzinfo=PH_TIMEZONE):
        parsed = datetime.now(PH_TIMEZONE)
    return parsed.strftime("%Y-%m")


def _append_archive_rows(rows: list[dict]) -> dict:
    if not rows:
        return {"archive_rows_written": 0, "archive_files": []}

    archive_dir = _chat_archive_dir()
    archive_dir.mkdir(parents=True, exist_ok=True)
    files_written: set[str] = set()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(_archive_month_key(row), []).append(row)

    for month_key, month_rows in grouped.items():
        archive_path = archive_dir / f"chat_archive_{month_key}.csv.gz"
        write_header = not archive_path.exists() or archive_path.stat().st_size == 0
        with gzip.open(archive_path, mode="at", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CHAT_LOG_FIELDS, extrasaction="ignore")
            if write_header:
                writer.writeheader()
            writer.writerows(month_rows)
        files_written.add(str(archive_path))

    return {
        "archive_rows_written": len(rows),
        "archive_files": sorted(files_written),
    }


def _archive_conversation_log_rows(sender_id: str) -> dict:
    rows = _load_chat_rows()
    selected = [row for row in rows if (row.get("Sender ID") or "") == sender_id]
    kept = [row for row in rows if (row.get("Sender ID") or "") != sender_id]
    archive_result = _append_archive_rows(selected)
    backup_path = _backup_chat_log() if selected else None
    _write_chat_rows(kept)
    return {
        "log_rows_archived": len(selected),
        "backup_path": backup_path,
        **archive_result,
    }


def _archive_all_conversation_log_rows() -> dict:
    rows = _load_chat_rows()
    archive_result = _append_archive_rows(rows)
    backup_path = _backup_chat_log() if rows else None
    _write_chat_rows([])
    return {
        "log_rows_archived": len(rows),
        "backup_path": backup_path,
        **archive_result,
    }


def _inactive_sender_ids(days_inactive: int = 30, now: datetime | None = None) -> list[str]:
    cutoff = (now or datetime.now(PH_TIMEZONE)) - timedelta(days=max(1, int(days_inactive or 30)))
    latest_by_sender: dict[str, datetime] = {}
    states = list_conversation_states()

    for row in _load_chat_rows():
        sender_id = row.get("Sender ID") or ""
        if not sender_id or _is_test_sender(sender_id):
            continue
        timestamp = _parse_chat_timestamp(row.get("Timestamp", ""))
        if timestamp == datetime.min.replace(tzinfo=PH_TIMEZONE):
            continue
        latest_by_sender[sender_id] = max(timestamp, latest_by_sender.get(sender_id, timestamp))

    for sender_id, state in states.items():
        if sender_id in latest_by_sender:
            continue
        if _is_test_sender(sender_id):
            continue
        timestamp = _parse_chat_timestamp(state.get("last_message_at") or state.get("updated_at") or "")
        if timestamp == datetime.min.replace(tzinfo=PH_TIMEZONE):
            continue
        latest_by_sender[sender_id] = max(timestamp, latest_by_sender.get(sender_id, timestamp))

    inactive = []
    for sender_id, latest in latest_by_sender.items():
        state = states.get(sender_id, {})
        if state.get("manual_active") or str(state.get("priority") or "").lower() in {"high", "critical"}:
            continue
        if latest < cutoff:
            inactive.append(sender_id)
    return sorted(inactive)


def _archive_inactive_conversations(days_inactive: int = 30) -> dict:
    sender_ids = _inactive_sender_ids(days_inactive)
    totals = {
        "archived": True,
        "mode": "inactive",
        "days_inactive": max(1, int(days_inactive or 30)),
        "conversation_count": len(sender_ids),
        "senders": sender_ids,
        "log_rows_archived": 0,
        "archive_rows_written": 0,
        "archive_files": [],
        "alerts_deleted": 0,
        "states_deleted": 0,
        "usage_rows_deleted": 0,
    }

    archive_files: set[str] = set()
    for sender_id in sender_ids:
        log_result = _archive_conversation_log_rows(sender_id)
        state_result = purge_conversation_records(sender_id)
        totals["log_rows_archived"] += int(log_result.get("log_rows_archived") or 0)
        totals["archive_rows_written"] += int(log_result.get("archive_rows_written") or 0)
        totals["alerts_deleted"] += int(state_result.get("alerts_deleted") or 0)
        totals["states_deleted"] += int(state_result.get("states_deleted") or 0)
        totals["usage_rows_deleted"] += int(state_result.get("usage_rows_deleted") or 0)
        archive_files.update(log_result.get("archive_files") or [])

    totals["archive_files"] = sorted(archive_files)
    return totals


def _list_archive_files() -> list[dict]:
    archive_dir = _chat_archive_dir()
    if not archive_dir.exists():
        return []

    files = []
    for path in sorted(archive_dir.glob("chat_archive_*.csv.gz"), reverse=True):
        files.append({
            "name": path.name,
            "path": str(path),
            "size_bytes": path.stat().st_size,
            "updated_at": datetime.fromtimestamp(path.stat().st_mtime, PH_TIMEZONE).strftime("%Y-%m-%d %I:%M:%S %p PHT"),
        })
    return files


def _purge_conversation_log_rows(sender_id: str) -> dict:
    rows = _load_chat_rows()
    kept = [row for row in rows if (row.get("Sender ID") or "") != sender_id]
    backup_path = _backup_chat_log() if len(kept) != len(rows) else None
    _write_chat_rows(kept)
    return {
        "log_rows_deleted": len(rows) - len(kept),
        "backup_path": backup_path,
    }


def _purge_all_conversation_log_rows() -> dict:
    rows = _load_chat_rows()
    backup_path = _backup_chat_log() if rows else None
    _write_chat_rows([])
    return {
        "log_rows_deleted": len(rows),
        "backup_path": backup_path,
    }


def _conversation_summaries(limit: int = 50, include_state_only: bool = False, include_test: bool = False) -> list[dict]:
    grouped: dict[str, dict] = {}
    states = list_conversation_states()

    for row in _load_chat_rows():
        sender_id = row.get("Sender ID") or "UNKNOWN"
        if not include_test and _is_test_chat_row(row):
            continue
        state = states.get(sender_id, {})
        timestamp_raw = row.get("Timestamp", "")
        timestamp = _parse_chat_timestamp(timestamp_raw)
        user_message = row.get("User Message") or ""
        bot_answer = row.get("Bot Answer") or ""
        preview = user_message if user_message and user_message != "[Attachment]" else bot_answer
        entry = grouped.get(sender_id)

        if not entry:
            grouped[sender_id] = {
                "sender_id": sender_id,
                "source": _infer_chat_source(sender_id),
                "last_timestamp": _format_chat_timestamp(timestamp_raw),
                "last_timestamp_sort": timestamp.isoformat(),
                "last_intent": row.get("Intent", "chat"),
                "last_preview": preview[:180],
                "turn_count": 1,
                "urgent_count": 1 if row.get("Is Urgent") == "URGENT" else 0,
                "category": state.get("category") or "LOW_PRIORITY_FAQ",
                "priority": state.get("priority") or "normal",
                "manual_active": bool(state.get("manual_active")),
                "manual_until": state.get("manual_until"),
                "manual_reason": state.get("manual_reason"),
                "category_source": state.get("category_source") or "rule",
                "ai_confidence": state.get("ai_confidence"),
                "ai_reason": state.get("ai_reason"),
                "ai_suggested_action": state.get("ai_suggested_action"),
            }
            continue

        entry["turn_count"] += 1
        if row.get("Is Urgent") == "URGENT":
            entry["urgent_count"] += 1
        if timestamp.isoformat() >= entry["last_timestamp_sort"]:
            entry["last_timestamp"] = _format_chat_timestamp(timestamp_raw)
            entry["last_timestamp_sort"] = timestamp.isoformat()
            entry["last_intent"] = row.get("Intent", "chat")
            entry["last_preview"] = preview[:180]
            entry["category"] = state.get("category") or entry.get("category") or "LOW_PRIORITY_FAQ"
            entry["priority"] = state.get("priority") or entry.get("priority") or "normal"
            entry["manual_active"] = bool(state.get("manual_active"))
            entry["manual_until"] = state.get("manual_until")
            entry["manual_reason"] = state.get("manual_reason")
            entry["category_source"] = state.get("category_source") or entry.get("category_source") or "rule"
            entry["ai_confidence"] = state.get("ai_confidence")
            entry["ai_reason"] = state.get("ai_reason")
            entry["ai_suggested_action"] = state.get("ai_suggested_action")

    if include_state_only:
        for sender_id, state in states.items():
            if sender_id in grouped:
                continue
            if not include_test and _is_test_sender(sender_id):
                continue
            timestamp_raw = state.get("last_message_at") or state.get("updated_at") or ""
            timestamp = _parse_chat_timestamp(timestamp_raw)
            grouped[sender_id] = {
                "sender_id": sender_id,
                "source": _infer_chat_source(sender_id),
                "last_timestamp": _format_chat_timestamp(timestamp_raw),
                "last_timestamp_sort": timestamp.isoformat(),
                "last_intent": "state_only",
                "last_preview": "[No archived transcript yet]",
                "turn_count": 0,
                "urgent_count": 0,
                "category": state.get("category") or "LOW_PRIORITY_FAQ",
                "priority": state.get("priority") or "normal",
                "manual_active": bool(state.get("manual_active")),
                "manual_until": state.get("manual_until"),
                "manual_reason": state.get("manual_reason"),
                "category_source": state.get("category_source") or "rule",
                "ai_confidence": state.get("ai_confidence"),
                "ai_reason": state.get("ai_reason"),
                "ai_suggested_action": state.get("ai_suggested_action"),
            }

    priority_rank = {"critical": 0, "high": 1, "medium": 2, "normal": 3, "low": 4}
    summaries = sorted(
        grouped.values(),
        key=lambda item: (
            -datetime.fromisoformat(item["last_timestamp_sort"]).timestamp(),
            priority_rank.get(str(item.get("priority") or "normal").lower(), 3),
            0 if item.get("manual_active") else 1,
        ),
    )[:limit]
    for item in summaries:
        item.pop("last_timestamp_sort", None)
    return summaries


def _conversation_messages(sender_id: str, limit: int = 200) -> list[dict]:
    rows = [row for row in _load_chat_rows() if (row.get("Sender ID") or "") == sender_id]
    rows = rows[-limit:]
    messages: list[dict] = []

    for row_index, row in enumerate(rows):
        timestamp = _format_chat_timestamp(row.get("Timestamp", ""))
        intent = row.get("Intent", "chat")
        urgent = row.get("Is Urgent") == "URGENT"
        user_message = row.get("User Message") or ""
        bot_answer = row.get("Bot Answer") or ""

        if intent == "incoming_event":
            receipt_incoming_markers = {"[Receipt Image]", "[Attachment]"}
            receipt_completed_markers = {
                "[Payment Receipt Image]",
                "[Booking Acknowledgement Image]",
                "[Non Receipt Image]",
            }

            def same_completed_turn(later_message: str) -> bool:
                if later_message == user_message:
                    return True
                user_is_receipt_marker = any(user_message.startswith(marker) for marker in receipt_incoming_markers)
                later_is_completed_marker = any(later_message.startswith(marker) for marker in receipt_completed_markers)
                return user_is_receipt_marker and later_is_completed_marker

            has_completed_turn = any(
                same_completed_turn(later.get("User Message") or "")
                and (later.get("Intent") or "") != "incoming_event"
                for later in rows[row_index + 1:]
            )
            if has_completed_turn:
                continue

        if intent.startswith("admin_"):
            messages.append({
                "timestamp": timestamp,
                "direction": "outbound",
                "author": "Admin",
                "text": bot_answer,
                "intent": intent,
                "urgent": urgent,
            })
            continue

        if user_message and user_message != "[Attachment]":
            messages.append({
                "timestamp": timestamp,
                "direction": "inbound",
                "author": "Guest",
                "text": user_message,
                "intent": intent,
                "urgent": urgent,
            })

        if bot_answer and bot_answer != "...":
            messages.append({
                "timestamp": timestamp,
                "direction": "outbound",
                "author": "Amalfi Concierge",
                "text": bot_answer,
                "intent": intent,
                "urgent": urgent,
            })

    return messages


def _notification_text(payload: dict) -> str:
    kind = payload.get("type", "generic")
    booking_ref = str(payload.get("booking_ref") or "").strip()

    if kind == "underpayment_reminder":
        amount_due = payload.get("amount_due", "the remaining balance")
        due_date = payload.get("due_date")
        due_suffix = f" Please settle on or before {due_date}." if due_date else ""
        booking_label = f"booking {booking_ref}" if booking_ref else "your booking"
        return (
            f"Hello from Amalfi Resort. This is a friendly reminder that {booking_label} still has an outstanding balance of {amount_due}."
            f"{due_suffix} Please reply here if you need help with payment confirmation."
        )

    if kind == "booking_notice":
        status = payload.get("status", "updated")
        note = str(payload.get("note", "")).strip()
        booking_label = f"booking {booking_ref}" if booking_ref else "booking"
        return f"Hello from Amalfi Resort. Your {booking_label} has been {status}.{f' {note}' if note else ''}".strip()

    return str(payload.get("text", "")).strip()


def _seed_demo_conversations() -> dict:
    for sender_id in DEMO_CHAT_SENDERS:
        _purge_conversation_log_rows(sender_id)
        purge_conversation_records(sender_id)

    now = datetime.now(PH_TIMEZONE)
    _append_chat_rows([
        {
            "Timestamp": (now - timedelta(minutes=4)).strftime("%Y-%m-%d %I:%M:%S %p PHT"),
            "Sender ID": "CHATBOT_DEMO_BOOKING_LEAD",
            "User Message": "Hi Amalfi, we are 8 pax and want to book AC Kubo from May 20, 2026 to May 21, 2026. Can you help reserve?",
            "Bot Answer": "Thanks for the details. I can help check the best AC Kubo setup and a staff member can confirm the reservation details.",
            "Intent": "booking_guidance",
            "Is Urgent": "URGENT",
        },
        {
            "Timestamp": (now - timedelta(minutes=3)).strftime("%Y-%m-%d %I:%M:%S %p PHT"),
            "Sender ID": "CHATBOT_DEMO_BOOKING_LEAD",
            "User Message": "Name is Demo Guest, phone 09170000001. We can pay a deposit today if available.",
            "Bot Answer": "Noted. Please wait while our team reviews the booking details and payment steps.",
            "Intent": "booking_guidance",
            "Is Urgent": "URGENT",
        },
        {
            "Timestamp": (now - timedelta(minutes=2)).strftime("%Y-%m-%d %I:%M:%S %p PHT"),
            "Sender ID": "CHATBOT_DEMO_LOCATION_FAQ",
            "User Message": "Where is Amalfi Resort located and how far is it from Subic?",
            "Bot Answer": "Amalfi Resort is in Zambales. Travel time from Subic depends on traffic, but our team can share map directions when needed.",
            "Intent": "location_inquiry",
            "Is Urgent": "Normal",
        },
        {
            "Timestamp": (now - timedelta(minutes=1)).strftime("%Y-%m-%d %I:%M:%S %p PHT"),
            "Sender ID": "CHATBOT_DEMO_LOCATION_FAQ",
            "User Message": "Do you also allow day tour walk-ins?",
            "Bot Answer": "Day tour availability can vary by date. Please share your preferred date and number of guests if you want us to check.",
            "Intent": "general_inquiry",
            "Is Urgent": "Normal",
        },
    ])
    update_conversation_metadata(
        "CHATBOT_DEMO_BOOKING_LEAD",
        "HOT_BOOKING_LEAD",
        "high",
        source="manual",
        ai_reason="Demo booking lead for Chatbot Monitor booking tools.",
        ai_suggested_action="Use Analyze Booking, review units, then test quick booking controls.",
    )

    update_conversation_metadata(
        "CHATBOT_DEMO_LOCATION_FAQ",
        "LOW_PRIORITY_FAQ",
        "normal",
        source="manual",
        ai_reason="Demo Bot-Handled location/general inquiry.",
        ai_suggested_action="Use Bot-Handled signals to test FAQ, location, and booking-related filters.",
    )

    return {
        "seeded": len(DEMO_CHAT_SENDERS),
        "senders": list(DEMO_CHAT_SENDERS),
    }

@app.get("/")
def health_check():
    missing_env = _missing_required_env()
    return {
        "status": "degraded" if missing_env else "online",
        "service": APP_NAME,
        "mode": "EDGE_NODE_ONLY",
        "hub_connection": os.getenv("HUB_URL", "http://localhost:3001"),
        "env_source": ENV_FILE_SOURCE,
        "missing_env": missing_env,
    }

@app.get("/logs")
def get_logs(limit: int = 50):
    log_path = _chat_log_path()
    if not log_path.exists():
        return {"logs": []}
    
    try:
        with open(log_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            # Return last N rows, reversed so newest is first
            return {"logs": rows[-limit:][::-1]}
    except Exception as e:
        return {"error": str(e), "logs": []}


@app.get("/conversations")
def get_conversations(limit: int = 50, include_state_only: bool = False, include_test: bool = False):
    return {
        "conversations": _conversation_summaries(
            limit=limit,
            include_state_only=include_state_only,
            include_test=include_test,
        ),
        "source": "chat_archive.csv",
        "include_state_only": include_state_only,
        "include_test": include_test,
    }


@app.post("/conversations/demo")
def seed_demo_conversations():
    return _seed_demo_conversations()


@app.get("/archives")
def get_archives():
    return {"archives": _list_archive_files()}


@app.get("/conversations/{sender_id}")
def get_conversation(sender_id: str, limit: int = 200):
    return {
        "sender_id": sender_id,
        "source": _infer_chat_source(sender_id),
        "state": get_conversation_state(sender_id),
        "messages": _conversation_messages(sender_id=sender_id, limit=limit),
    }


@app.post("/conversations/{sender_id}/archive")
def archive_conversation(sender_id: str):
    log_result = _archive_conversation_log_rows(sender_id)
    state_result = purge_conversation_records(sender_id)
    return {
        "archived": True,
        "sender_id": sender_id,
        **log_result,
        **state_result,
    }


@app.delete("/conversations/{sender_id}")
def delete_conversation(sender_id: str):
    log_result = _purge_conversation_log_rows(sender_id)
    state_result = purge_conversation_records(sender_id)
    return {
        "deleted": True,
        "sender_id": sender_id,
        **log_result,
        **state_result,
    }


@app.post("/conversations/archive")
def archive_conversations(payload: dict | None = None):
    payload = payload or {}
    mode = str(payload.get("mode") or "").strip().lower()
    if mode == "inactive":
        return _archive_inactive_conversations(int(payload.get("days_inactive") or 30))
    if mode != "all":
        return {"error": "Unsupported archive mode. Use mode='all' or mode='inactive'.", "archived": False}

    log_result = _archive_all_conversation_log_rows()
    state_result = purge_all_monitor_records()
    return {
        "archived": True,
        "mode": "all",
        **log_result,
        **state_result,
    }


@app.post("/conversations/purge")
def purge_conversations(payload: dict | None = None):
    payload = payload or {}
    mode = str(payload.get("mode") or "").strip().lower()
    if mode != "all":
        return {"error": "Unsupported purge mode. Use mode='all' to clear monitor history.", "deleted": False}

    log_result = _purge_all_conversation_log_rows()
    state_result = purge_all_monitor_records()
    return {
        "deleted": True,
        "mode": "all",
        **log_result,
        **state_result,
    }


@app.post("/conversations/{sender_id}/reply")
async def send_admin_reply(sender_id: str, payload: dict):
    source = payload.get("source") or _infer_chat_source(sender_id)
    text = str(payload.get("text") or "").strip()
    if not text:
        return {"error": "Reply text is required.", "sent": False}
    if source != "messenger":
        return {"error": "Only Messenger conversations currently support outbound admin replies.", "sent": False}

    sent = await send_message(sender_id, text)
    if not sent:
        return {"error": "Failed to deliver the message to Messenger.", "sent": False}

    archive_chat_turn(sender_id, "[ADMIN_OUTBOUND]", text, payload.get("intent", "admin_reply"), bool(payload.get("urgent")))
    
    # Auto-pause chatbot when admin replies
    set_conversation_pause(sender_id, True, duration_hours=2, reason="admin_reply", category="MANUAL_ACTIVE", priority="high", admin_reply=True)
    
    return {"sent": True, "message": "Reply sent successfully.", "is_paused": True}


@app.get("/conversations/{sender_id}/status")
def get_sender_status(sender_id: str):
    return get_conversation_state(sender_id)


@app.patch("/conversations/{sender_id}/category")
def update_sender_category(sender_id: str, payload: dict):
    category = str(payload.get("category") or "LOW_PRIORITY_FAQ").strip().upper()
    priority = str(payload.get("priority") or "normal").strip().lower()
    allowed_categories = {
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
    allowed_priorities = {"low", "normal", "medium", "high", "critical"}
    if category not in allowed_categories:
        return {"error": "Unsupported conversation category.", "updated": False}
    if priority not in allowed_priorities:
        return {"error": "Unsupported conversation priority.", "updated": False}
    update_conversation_metadata(sender_id, category, priority, last_message=False, source="manual")
    return {"updated": True, "sender_id": sender_id, **get_conversation_state(sender_id)}


@app.post("/conversations/{sender_id}/pause")
async def pause_conversation(sender_id: str, payload: dict | None = None):
    payload = payload or {}
    hours = float(payload.get("duration_hours") or 2)
    reason = payload.get("reason") or "admin_manual_pause"
    set_conversation_pause(sender_id, True, duration_hours=hours, reason=reason, category="MANUAL_ACTIVE", priority="high")
    if _truthy(payload.get("notify_guest")):
        text = str(payload.get("notify_text") or "You're now connected with Amalfi Resort Guest Services. A live team member is handling this chat, so the automated assistant will stay quiet while we help you.")
        sent = await send_message(sender_id, text)
        if sent:
            archive_chat_turn(sender_id, "[MANUAL_HANDOFF_NOTICE]", text, "manual_handoff_notice", False)
    return {"sender_id": sender_id, **get_conversation_state(sender_id)}


@app.post("/conversations/{sender_id}/resume")
def resume_conversation(sender_id: str):
    set_conversation_pause(sender_id, False)
    return {"sender_id": sender_id, **get_conversation_state(sender_id)}


@app.post("/conversations/{sender_id}/notify")
async def send_admin_notification(sender_id: str, payload: dict):
    source = payload.get("source") or _infer_chat_source(sender_id)
    if source != "messenger":
        return {"error": "Only Messenger conversations currently support outbound notifications.", "sent": False}

    text = _notification_text(payload)
    if not text:
        return {"error": "Notification payload did not produce any message text.", "sent": False}

    if bool(payload.get("preview_only") or payload.get("dry_run")):
        return {"sent": False, "preview": True, "message": "Notification preview generated.", "text": text}

    sent = await send_message(sender_id, text)
    if not sent:
        return {"error": "Failed to deliver the notification to Messenger.", "sent": False}

    archive_chat_turn(sender_id, "[ADMIN_NOTIFICATION]", text, f"admin_{payload.get('type', 'notification')}", False)
    return {"sent": True, "message": "Notification sent successfully.", "text": text}


@app.get("/alerts")
def get_alerts(limit: int = 50, status: str = "open", include_test: bool = False):
    raw_alerts = list_chatbot_alerts(limit=limit, status=status)
    alerts = raw_alerts if include_test else [alert for alert in raw_alerts if not _is_test_alert(alert)]
    summary = {
        "open": sum(1 for alert in alerts if alert.get("status") in {"new", "acknowledged"}),
        "new": sum(1 for alert in alerts if alert.get("status") == "new"),
        "high": sum(1 for alert in alerts if alert.get("urgency") == "high"),
    }
    return {"alerts": alerts, "summary": summary}


@app.patch("/alerts/{alert_id}")
async def patch_alert(alert_id: int, payload: dict):
    updated = update_chatbot_alert_status(
        alert_id=alert_id,
        status=payload.get("status", "acknowledged"),
        admin_note=payload.get("admin_note"),
    )
    if not updated:
        return {"error": "Alert not found", "alert": None}
    return {"alert": updated}

if __name__ == "__main__":
    import uvicorn
    # Critical: disabled reload to prevent worker restarts while storing AI states or receipts
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
