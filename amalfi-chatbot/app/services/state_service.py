import os
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DB_PATH = Path(os.getenv("CHATBOT_STATE_DB", REPO_ROOT / "amalfi-system" / "runtime" / "chatbot" / "chatbot_state.sqlite"))
PH_TIMEZONE = timezone(timedelta(hours=8))


def _utc_timestamp() -> str:
    return datetime.now(PH_TIMEZONE).strftime("%Y-%m-%d %I:%M:%S %p PHT")


def _parse_timestamp(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d %I:%M:%S %p PHT").replace(tzinfo=PH_TIMEZONE)
    except ValueError:
        return None


def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_ai_usage (
            sender_id TEXT NOT NULL,
            usage_date TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (sender_id, usage_date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chatbot_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'messenger',
            user_message TEXT NOT NULL,
            bot_answer TEXT NOT NULL,
            escalation_reason TEXT NOT NULL,
            urgency TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'new',
            admin_note TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS conversation_states (
            sender_id TEXT PRIMARY KEY,
            is_paused INTEGER NOT NULL DEFAULT 0,
            paused_at TEXT,
            manual_until TEXT,
            manual_reason TEXT,
            category TEXT DEFAULT 'LOW_PRIORITY_FAQ',
            priority TEXT DEFAULT 'normal',
            category_source TEXT DEFAULT 'rule',
            ai_confidence REAL,
            ai_reason TEXT,
            ai_suggested_action TEXT,
            ai_tagged_at TEXT,
            last_message_at TEXT,
            last_admin_reply_at TEXT,
            updated_at TEXT
        )
        """
    )
    for column, column_type in [
        ("manual_until", "TEXT"),
        ("manual_reason", "TEXT"),
        ("category", "TEXT DEFAULT 'LOW_PRIORITY_FAQ'"),
        ("priority", "TEXT DEFAULT 'normal'"),
        ("category_source", "TEXT DEFAULT 'rule'"),
        ("ai_confidence", "REAL"),
        ("ai_reason", "TEXT"),
        ("ai_suggested_action", "TEXT"),
        ("ai_tagged_at", "TEXT"),
        ("last_message_at", "TEXT"),
        ("last_admin_reply_at", "TEXT"),
        ("updated_at", "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE conversation_states ADD COLUMN {column} {column_type}")
        except sqlite3.OperationalError:
            pass
    return conn


def get_daily_ai_usage(sender_id: str, usage_date: str) -> int:
    with _connect() as conn:
        row = conn.execute(
            "SELECT count FROM daily_ai_usage WHERE sender_id = ? AND usage_date = ?",
            (sender_id, usage_date),
        ).fetchone()
        return int(row[0]) if row else 0


def increment_daily_ai_usage(sender_id: str, usage_date: str) -> int:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO daily_ai_usage (sender_id, usage_date, count)
            VALUES (?, ?, 1)
            ON CONFLICT(sender_id, usage_date)
            DO UPDATE SET count = count + 1
            """,
            (sender_id, usage_date),
        )
        row = conn.execute(
            "SELECT count FROM daily_ai_usage WHERE sender_id = ? AND usage_date = ?",
            (sender_id, usage_date),
        ).fetchone()
        conn.commit()
        return int(row[0]) if row else 0


def reset_daily_ai_usage(sender_id: str, usage_date: str | None = None):
    with _connect() as conn:
        if usage_date:
            conn.execute(
                "DELETE FROM daily_ai_usage WHERE sender_id = ? AND usage_date = ?",
                (sender_id, usage_date),
            )
        else:
            conn.execute("DELETE FROM daily_ai_usage WHERE sender_id = ?", (sender_id,))
        conn.commit()


def create_chatbot_alert(
    sender_id: str,
    user_message: str,
    bot_answer: str,
    escalation_reason: str,
    urgency: str = "medium",
    source: str = "messenger",
    created_at: str | None = None,
) -> int:
    timestamp = created_at or _utc_timestamp()
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO chatbot_alerts (
                created_at, sender_id, source, user_message, bot_answer,
                escalation_reason, urgency, status, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
            """,
            (timestamp, sender_id, source, user_message, bot_answer, escalation_reason, urgency, timestamp),
        )
        conn.commit()
        return int(cursor.lastrowid)


def list_chatbot_alerts(limit: int = 50, status: str = "open") -> list[dict]:
    query = """
        SELECT id, created_at, sender_id, source, user_message, bot_answer,
               escalation_reason, urgency, status, admin_note, updated_at
        FROM chatbot_alerts
    """
    params: tuple = ()
    normalized = (status or "open").lower()
    if normalized == "open":
        query += " WHERE status IN ('new', 'acknowledged')"
    elif normalized not in {"all", ""}:
        query += " WHERE status = ?"
        params = (normalized,)
    query += " ORDER BY id DESC LIMIT ?"
    params = (*params, int(limit))

    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]


def update_chatbot_alert_status(alert_id: int, status: str, admin_note: str | None = None) -> dict | None:
    timestamp = _utc_timestamp()
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id FROM chatbot_alerts WHERE id = ?",
            (int(alert_id),),
        ).fetchone()
        if not row:
            return None

        conn.execute(
            """
            UPDATE chatbot_alerts
            SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = ?
            WHERE id = ?
            """,
            (status, admin_note, timestamp, int(alert_id)),
        )
        conn.commit()
        updated = conn.execute(
            """
            SELECT id, created_at, sender_id, source, user_message, bot_answer,
                   escalation_reason, urgency, status, admin_note, updated_at
            FROM chatbot_alerts
            WHERE id = ?
            """,
            (int(alert_id),),
        ).fetchone()
        return dict(updated) if updated else None


def purge_conversation_records(sender_id: str) -> dict:
    with _connect() as conn:
        alert_count = conn.execute(
            "SELECT COUNT(*) FROM chatbot_alerts WHERE sender_id = ?",
            (sender_id,),
        ).fetchone()[0]
        state_count = conn.execute(
            "SELECT COUNT(*) FROM conversation_states WHERE sender_id = ?",
            (sender_id,),
        ).fetchone()[0]
        usage_count = conn.execute(
            "SELECT COUNT(*) FROM daily_ai_usage WHERE sender_id = ?",
            (sender_id,),
        ).fetchone()[0]
        conn.execute("DELETE FROM chatbot_alerts WHERE sender_id = ?", (sender_id,))
        conn.execute("DELETE FROM conversation_states WHERE sender_id = ?", (sender_id,))
        conn.execute("DELETE FROM daily_ai_usage WHERE sender_id = ?", (sender_id,))
        conn.commit()
    return {
        "alerts_deleted": int(alert_count or 0),
        "states_deleted": int(state_count or 0),
        "usage_rows_deleted": int(usage_count or 0),
    }


def purge_all_monitor_records() -> dict:
    with _connect() as conn:
        alert_count = conn.execute("SELECT COUNT(*) FROM chatbot_alerts").fetchone()[0]
        state_count = conn.execute("SELECT COUNT(*) FROM conversation_states").fetchone()[0]
        usage_count = conn.execute("SELECT COUNT(*) FROM daily_ai_usage").fetchone()[0]
        conn.execute("DELETE FROM chatbot_alerts")
        conn.execute("DELETE FROM conversation_states")
        conn.execute("DELETE FROM daily_ai_usage")
        conn.commit()
    return {
        "alerts_deleted": int(alert_count or 0),
        "states_deleted": int(state_count or 0),
        "usage_rows_deleted": int(usage_count or 0),
    }


def get_conversation_state(sender_id: str) -> dict:
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT is_paused, paused_at, manual_until, manual_reason, category,
                   priority, category_source, ai_confidence, ai_reason,
                   ai_suggested_action, ai_tagged_at,
                   last_message_at, last_admin_reply_at, updated_at
            FROM conversation_states
            WHERE sender_id = ?
            """,
            (sender_id,),
        ).fetchone()
        if not row:
            return {
                "is_paused": False,
                "manual_active": False,
                "paused_at": None,
                "manual_until": None,
                "manual_reason": None,
                "category": "LOW_PRIORITY_FAQ",
                "priority": "normal",
                "category_source": "rule",
                "ai_confidence": None,
                "ai_reason": None,
                "ai_suggested_action": None,
                "ai_tagged_at": None,
                "last_message_at": None,
                "last_admin_reply_at": None,
                "updated_at": None,
            }

        manual_until = _parse_timestamp(row["manual_until"])
        manual_active = bool(row["is_paused"]) and bool(manual_until and manual_until > datetime.now(PH_TIMEZONE))
        return {
            "is_paused": bool(row["is_paused"]),
            "manual_active": manual_active,
            "paused_at": row["paused_at"],
            "manual_until": row["manual_until"],
            "manual_reason": row["manual_reason"],
            "category": row["category"] or "LOW_PRIORITY_FAQ",
            "priority": row["priority"] or "normal",
            "category_source": row["category_source"] or "rule",
            "ai_confidence": row["ai_confidence"],
            "ai_reason": row["ai_reason"],
            "ai_suggested_action": row["ai_suggested_action"],
            "ai_tagged_at": row["ai_tagged_at"],
            "last_message_at": row["last_message_at"],
            "last_admin_reply_at": row["last_admin_reply_at"],
            "updated_at": row["updated_at"],
        }


def set_conversation_pause(
    sender_id: str,
    paused: bool,
    duration_hours: float = 2,
    reason: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    admin_reply: bool = False,
):
    timestamp = _utc_timestamp()
    paused_at = timestamp if paused else None
    manual_until = (datetime.now(PH_TIMEZONE) + timedelta(hours=duration_hours)).strftime("%Y-%m-%d %I:%M:%S %p PHT") if paused else None
    next_reason = reason if paused else None
    next_category = category if category else ("MANUAL_ACTIVE" if paused else "LOW_PRIORITY_FAQ")
    next_priority = priority if priority else ("high" if paused else "normal")
    admin_reply_at = timestamp if admin_reply else None
    print(f"DEBUG: set_conversation_pause | sender_id={sender_id} | paused={paused} | until={manual_until}")
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO conversation_states (
                sender_id, is_paused, paused_at, manual_until, manual_reason,
                category, priority, last_admin_reply_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sender_id) DO UPDATE SET
                is_paused = excluded.is_paused,
                paused_at = excluded.paused_at,
                manual_until = excluded.manual_until,
                manual_reason = excluded.manual_reason,
                category = excluded.category,
                priority = excluded.priority,
                last_admin_reply_at = COALESCE(excluded.last_admin_reply_at, conversation_states.last_admin_reply_at),
                updated_at = excluded.updated_at
            """,
            (sender_id, int(paused), paused_at, manual_until, next_reason, next_category, next_priority, admin_reply_at, timestamp),
        )
        conn.commit()
    print(f"DEBUG: set_conversation_pause SUCCESS for {sender_id}")


def update_conversation_metadata(
    sender_id: str,
    category: str,
    priority: str = "normal",
    last_message: bool = True,
    source: str = "rule",
    ai_confidence: float | None = None,
    ai_reason: str | None = None,
    ai_suggested_action: str | None = None,
):
    timestamp = _utc_timestamp()
    ai_tagged_at = timestamp if source == "ai" else None
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO conversation_states (
                sender_id, is_paused, category, priority, category_source,
                ai_confidence, ai_reason, ai_suggested_action, ai_tagged_at,
                last_message_at, updated_at
            )
            VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sender_id) DO UPDATE SET
                category = excluded.category,
                priority = excluded.priority,
                category_source = excluded.category_source,
                ai_confidence = COALESCE(excluded.ai_confidence, conversation_states.ai_confidence),
                ai_reason = COALESCE(excluded.ai_reason, conversation_states.ai_reason),
                ai_suggested_action = COALESCE(excluded.ai_suggested_action, conversation_states.ai_suggested_action),
                ai_tagged_at = COALESCE(excluded.ai_tagged_at, conversation_states.ai_tagged_at),
                last_message_at = COALESCE(excluded.last_message_at, conversation_states.last_message_at),
                updated_at = excluded.updated_at
            """,
            (
                sender_id,
                category,
                priority,
                source,
                ai_confidence,
                ai_reason,
                ai_suggested_action,
                ai_tagged_at,
                timestamp if last_message else None,
                timestamp,
            ),
        )
        conn.commit()


def list_conversation_states() -> dict[str, dict]:
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT sender_id, is_paused, paused_at, manual_until, manual_reason,
                   category, priority, category_source, ai_confidence, ai_reason,
                   ai_suggested_action, ai_tagged_at,
                   last_message_at, last_admin_reply_at, updated_at
            FROM conversation_states
            """
        ).fetchall()

    states: dict[str, dict] = {}
    for row in rows:
        state = dict(row)
        manual_until = _parse_timestamp(state.get("manual_until"))
        state["is_paused"] = bool(state.get("is_paused"))
        state["manual_active"] = bool(state["is_paused"] and manual_until and manual_until > datetime.now(PH_TIMEZONE))
        states[state["sender_id"]] = state
    return states
