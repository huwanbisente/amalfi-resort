import main
import csv
import gzip
from app.services import state_service


def test_conversation_summaries_use_latest_guest_message_and_pht_sort(monkeypatch):
    monkeypatch.setattr(main, "list_conversation_states", lambda: {})
    monkeypatch.setattr(
        main,
        "_load_chat_rows",
        lambda: [
            {
                "Timestamp": "2026-04-13 22:14:21 UTC",
                "Sender ID": "guest-1",
                "User Message": "rates po for 2pax",
                "Bot Answer": "For room planning, use Book Now.",
                "Intent": "booking_guidance",
                "Is Urgent": "Normal",
            },
            {
                "Timestamp": "2026-04-14 08:05:00 AM PHT",
                "Sender ID": "guest-2",
                "User Message": "latest payment concern",
                "Bot Answer": "Please send proof of payment.",
                "Intent": "payment_inquiry",
                "Is Urgent": "URGENT",
            },
        ],
    )

    conversations = main._conversation_summaries(limit=10)

    assert conversations[0]["sender_id"] == "guest-2"
    assert conversations[0]["last_preview"] == "latest payment concern"
    assert conversations[0]["last_timestamp"].endswith("PHT")
    assert conversations[1]["last_preview"] == "rates po for 2pax"


def test_conversation_summaries_are_recency_first_even_when_old_thread_is_high_priority(monkeypatch):
    monkeypatch.setattr(
        main,
        "list_conversation_states",
        lambda: {
            "old-hot": {"category": "MANUAL_ACTIVE", "priority": "high", "manual_active": True},
            "new-normal": {"category": "LOW_PRIORITY_FAQ", "priority": "normal", "manual_active": False},
        },
    )
    monkeypatch.setattr(
        main,
        "_load_chat_rows",
        lambda: [
            {
                "Timestamp": "2026-05-01 08:00:00 AM PHT",
                "Sender ID": "old-hot",
                "User Message": "old manual thread",
                "Bot Answer": "Manual mode active.",
                "Intent": "handover_active",
                "Is Urgent": "URGENT",
            },
            {
                "Timestamp": "2026-05-01 10:27:00 AM PHT",
                "Sender ID": "new-normal",
                "User Message": "new dummy facebook message",
                "Bot Answer": "...",
                "Intent": "incoming_event",
                "Is Urgent": "Normal",
            },
        ],
    )

    conversations = main._conversation_summaries(limit=10)

    assert conversations[0]["sender_id"] == "new-normal"
    assert conversations[0]["last_preview"] == "new dummy facebook message"


def test_conversation_summaries_include_state_only_live_threads(monkeypatch):
    monkeypatch.setattr(
        main,
        "list_conversation_states",
        lambda: {
            "state-only": {
                "category": "LOW_PRIORITY_FAQ",
                "priority": "normal",
                "manual_active": False,
                "last_message_at": "2026-05-01 02:30:00 UTC",
                "updated_at": "2026-05-01 02:30:00 UTC",
            }
        },
    )
    monkeypatch.setattr(main, "_load_chat_rows", lambda: [])

    conversations = main._conversation_summaries(limit=10, include_state_only=True)

    assert conversations[0]["sender_id"] == "state-only"
    assert conversations[0]["last_preview"] == "[No archived transcript yet]"


def test_conversation_summaries_default_to_transcript_backed_rows(monkeypatch):
    monkeypatch.setattr(
        main,
        "list_conversation_states",
        lambda: {
            "state-only": {
                "category": "MANUAL_ACTIVE",
                "priority": "high",
                "manual_active": True,
                "last_message_at": "2026-05-01 02:30:00 PM PHT",
                "updated_at": "2026-05-01 02:30:00 PM PHT",
            }
        },
    )
    monkeypatch.setattr(main, "_load_chat_rows", lambda: [])

    assert main._conversation_summaries(limit=10) == []


def test_conversation_summaries_filter_dummy_stress_rows(monkeypatch):
    monkeypatch.setattr(main, "list_conversation_states", lambda: {})
    monkeypatch.setattr(
        main,
        "_load_chat_rows",
        lambda: [
            {
                "Timestamp": "2026-05-01 10:00:00 AM PHT",
                "Sender ID": "STRESS_USER_0",
                "User Message": "Stress test message 0",
                "Bot Answer": "Static Stress Response",
                "Intent": "faq",
                "Is Urgent": "Normal",
            },
            {
                "Timestamp": "2026-05-01 10:05:00 AM PHT",
                "Sender ID": "WEB_DIAGNOSTIC",
                "User Message": "Testing connection",
                "Bot Answer": "Diagnostic response",
                "Intent": "inquiry",
                "Is Urgent": "Normal",
            },
            {
                "Timestamp": "2026-05-01 10:10:00 AM PHT",
                "Sender ID": "26425692797127273",
                "User Message": "Balak po kasi naming mag add",
                "Bot Answer": "Sure po.",
                "Intent": "booking_guidance",
                "Is Urgent": "Normal",
            },
        ],
    )

    conversations = main._conversation_summaries(limit=10)

    assert [item["sender_id"] for item in conversations] == ["26425692797127273"]


def test_conversation_messages_hide_incoming_marker_when_completed_turn_exists(monkeypatch):
    monkeypatch.setattr(
        main,
        "_load_chat_rows",
        lambda: [
            {
                "Timestamp": "2026-05-01 10:27:00 AM PHT",
                "Sender ID": "guest-1",
                "User Message": "hello",
                "Bot Answer": "...",
                "Intent": "incoming_event",
                "Is Urgent": "Normal",
            },
            {
                "Timestamp": "2026-05-01 10:27:02 AM PHT",
                "Sender ID": "guest-1",
                "User Message": "hello",
                "Bot Answer": "Hello! How can I help?",
                "Intent": "main_menu",
                "Is Urgent": "Normal",
            },
        ],
    )

    messages = main._conversation_messages("guest-1", limit=10)

    assert [message["text"] for message in messages] == ["hello", "Hello! How can I help?"]


def test_conversation_messages_hide_receipt_marker_when_image_turn_exists(monkeypatch):
    monkeypatch.setattr(
        main,
        "_load_chat_rows",
        lambda: [
            {
                "Timestamp": "2026-05-01 10:27:00 AM PHT",
                "Sender ID": "guest-1",
                "User Message": "[Receipt Image] https://example.com/gcash.jpg",
                "Bot Answer": "",
                "Intent": "incoming_event",
                "Is Urgent": "Normal",
            },
            {
                "Timestamp": "2026-05-01 10:27:02 AM PHT",
                "Sender ID": "guest-1",
                "User Message": "[Payment Receipt Image] https://example.com/gcash.jpg",
                "Bot Answer": "Thanks for sending your receipt.",
                "Intent": "payment_receipt",
                "Is Urgent": "URGENT",
            },
        ],
    )

    messages = main._conversation_messages("guest-1", limit=10)

    assert [message["text"] for message in messages] == [
        "[Payment Receipt Image] https://example.com/gcash.jpg",
        "Thanks for sending your receipt.",
    ]


def test_purge_conversation_log_rows_keeps_other_threads_and_creates_backup(monkeypatch, tmp_path):
    log_path = tmp_path / "chat_archive.csv"
    log_path.write_text(
        "Timestamp,Sender ID,User Message,Bot Answer,Intent,Is Urgent\n"
        "2026-05-01 10:00:00 AM PHT,delete-me,old test,...,incoming_event,Normal\n"
        "2026-05-01 10:01:00 AM PHT,keep-me,real guest,Hello,ai_inquiry,Normal\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "_chat_log_path", lambda: log_path)

    result = main._purge_conversation_log_rows("delete-me")
    rows = main._load_chat_rows()

    assert result["log_rows_deleted"] == 1
    assert result["backup_path"]
    assert [row["Sender ID"] for row in rows] == ["keep-me"]


def test_archive_conversation_log_rows_moves_thread_to_monthly_gzip(monkeypatch, tmp_path):
    log_path = tmp_path / "chat_archive.csv"
    archive_dir = tmp_path / "archive"
    log_path.write_text(
        "Timestamp,Sender ID,User Message,Bot Answer,Intent,Is Urgent\n"
        "2026-05-01 10:00:00 AM PHT,archive-me,old guest,reply,ai_inquiry,Normal\n"
        "2026-05-01 10:01:00 AM PHT,keep-me,real guest,Hello,ai_inquiry,Normal\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "_chat_log_path", lambda: log_path)
    monkeypatch.setattr(main, "_chat_archive_dir", lambda: archive_dir)

    result = main._archive_conversation_log_rows("archive-me")
    active_rows = main._load_chat_rows()
    archive_path = archive_dir / "chat_archive_2026-05.csv.gz"

    assert result["log_rows_archived"] == 1
    assert result["archive_rows_written"] == 1
    assert archive_path.exists()
    assert [row["Sender ID"] for row in active_rows] == ["keep-me"]

    with gzip.open(archive_path, mode="rt", encoding="utf-8") as f:
        archive_rows = list(csv.DictReader(f))
    assert archive_rows[0]["Sender ID"] == "archive-me"


def test_archive_inactive_conversations_skips_priority_and_manual_threads(monkeypatch, tmp_path):
    log_path = tmp_path / "chat_archive.csv"
    archive_dir = tmp_path / "archive"
    old_timestamp = (main.datetime.now(main.PH_TIMEZONE) - main.timedelta(days=45)).strftime("%Y-%m-%d %I:%M:%S %p PHT")
    active_timestamp = (main.datetime.now(main.PH_TIMEZONE) - main.timedelta(days=2)).strftime("%Y-%m-%d %I:%M:%S %p PHT")
    log_path.write_text(
        "Timestamp,Sender ID,User Message,Bot Answer,Intent,Is Urgent\n"
        f"{old_timestamp},inactive-normal,old faq,reply,ai_inquiry,Normal\n"
        f"{old_timestamp},inactive-hot,old lead,reply,human_handoff,URGENT\n"
        f"{active_timestamp},active-normal,current faq,reply,ai_inquiry,Normal\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "_chat_log_path", lambda: log_path)
    monkeypatch.setattr(main, "_chat_archive_dir", lambda: archive_dir)
    monkeypatch.setattr(state_service, "DB_PATH", tmp_path / "chatbot_state.sqlite")
    monkeypatch.setattr(main, "list_conversation_states", state_service.list_conversation_states)
    monkeypatch.setattr(main, "purge_conversation_records", state_service.purge_conversation_records)

    state_service.update_conversation_metadata("inactive-normal", "LOW_PRIORITY_FAQ", "normal")
    state_service.update_conversation_metadata("inactive-hot", "HOT_BOOKING_LEAD", "high")

    result = main._archive_inactive_conversations(30)
    active_rows = main._load_chat_rows()

    assert result["conversation_count"] == 1
    assert result["senders"] == ["inactive-normal"]
    assert [row["Sender ID"] for row in active_rows] == ["inactive-hot", "active-normal"]


def test_purge_all_monitor_records_clears_chatbot_state(monkeypatch, tmp_path):
    monkeypatch.setattr(state_service, "DB_PATH", tmp_path / "chatbot_state.sqlite")
    state_service.create_chatbot_alert("guest-1", "help", "reply", "guest_requested_human")
    state_service.set_conversation_pause("guest-1", True)
    state_service.increment_daily_ai_usage("guest-1", "2026-05-01")

    result = state_service.purge_all_monitor_records()

    assert result["alerts_deleted"] == 1
    assert result["states_deleted"] == 1
    assert result["usage_rows_deleted"] == 1
    assert state_service.list_chatbot_alerts(limit=10, status="all") == []
    assert state_service.list_conversation_states() == {}


def test_update_sender_category_endpoint_tags_booked(monkeypatch, tmp_path):
    monkeypatch.setattr(state_service, "DB_PATH", tmp_path / "chatbot_state.sqlite")
    monkeypatch.setattr(main, "get_conversation_state", state_service.get_conversation_state)
    monkeypatch.setattr(main, "update_conversation_metadata", state_service.update_conversation_metadata)

    result = main.update_sender_category("guest-booked", {"category": "CONFIRMED_BOOKING", "priority": "medium"})

    assert result["updated"] is True
    assert result["category"] == "CONFIRMED_BOOKING"
    assert result["priority"] == "medium"
    assert result["category_source"] == "manual"


def test_state_service_stores_ai_triage_metadata(monkeypatch, tmp_path):
    monkeypatch.setattr(state_service, "DB_PATH", tmp_path / "chatbot_state.sqlite")

    state_service.update_conversation_metadata(
        "guest-ai",
        "HOT_BOOKING_LEAD",
        "high",
        source="ai",
        ai_confidence=0.92,
        ai_reason="Asked about trip timing and likely booking.",
        ai_suggested_action="Ask dates and pax.",
    )
    state = state_service.get_conversation_state("guest-ai")

    assert state["category"] == "HOT_BOOKING_LEAD"
    assert state["category_source"] == "ai"
    assert state["ai_confidence"] == 0.92
    assert state["ai_reason"] == "Asked about trip timing and likely booking."
    assert state["ai_suggested_action"] == "Ask dates and pax."


def test_format_chat_timestamp_converts_utc_to_pht():
    formatted = main._format_chat_timestamp("2026-04-13 22:14:21 UTC")
    assert formatted == "2026-04-14 06:14:21 AM PHT"


def test_notification_text_builds_booking_notice():
    text = main._notification_text({
        "type": "booking_notice",
        "booking_ref": "RES-1234",
        "status": "confirmed",
        "note": "Your check-in details are ready.",
    })

    assert text == "Hello from Amalfi Resort. Your booking RES-1234 has been confirmed. Your check-in details are ready."


def test_notification_text_builds_underpayment_reminder():
    text = main._notification_text({
        "type": "underpayment_reminder",
        "booking_ref": "RES-1234",
        "amount_due": "PHP 5,000",
        "due_date": "2026-05-10",
    })

    assert "RES-1234" in text
    assert "PHP 5,000" in text
    assert "2026-05-10" in text


def test_seed_demo_conversations_creates_visible_booking_and_bot_threads(monkeypatch, tmp_path):
    log_path = tmp_path / "chat_archive.csv"
    monkeypatch.setattr(main, "_chat_log_path", lambda: log_path)
    monkeypatch.setattr(state_service, "DB_PATH", tmp_path / "chatbot_state.sqlite")
    monkeypatch.setattr(main, "purge_conversation_records", state_service.purge_conversation_records)
    monkeypatch.setattr(main, "update_conversation_metadata", state_service.update_conversation_metadata)
    monkeypatch.setattr(main, "list_conversation_states", state_service.list_conversation_states)

    result = main._seed_demo_conversations()
    conversations = main._conversation_summaries(limit=10)
    categories = {item["sender_id"]: item["category"] for item in conversations}

    assert result["seeded"] == 2
    assert "CHATBOT_DEMO_BOOKING_LEAD" in categories
    assert "CHATBOT_DEMO_LOCATION_FAQ" in categories
    assert categories["CHATBOT_DEMO_BOOKING_LEAD"] == "HOT_BOOKING_LEAD"
    assert categories["CHATBOT_DEMO_LOCATION_FAQ"] == "LOW_PRIORITY_FAQ"
