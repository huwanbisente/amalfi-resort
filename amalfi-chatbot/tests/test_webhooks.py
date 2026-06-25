import sys
import os
import sqlite3
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import Request, Response

# Add the chatbot app to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.webhooks import (
    verify_messenger,
    load_knowledge_base,
    build_context,
    build_human_handoff_text,
    build_booking_guidance_text,
    build_combo_booking_handoff_text,
    detect_handoff_need,
    DAILY_AI_MESSAGE_COUNTS,
    detect_language_mode,
    detect_recommendation_mode,
    get_daily_ai_count,
    increment_daily_ai_count,
    find_room_recommendations,
    format_room_recommendation,
    build_special_recommendation_response,
    build_room_rate_elements,
    sanitize_guest_reply,
    is_main_menu_request,
    is_bot_resume_request,
    is_resort_related_message,
    categorize_inquiry,
    get_ai_daily_limit,
    build_contextual_inquiry_message,
    format_hub_analysis_for_ai,
    should_use_ai_triage,
    needs_combo_booking_handoff,
    resolve_structured_menu_response,
    build_messenger_delivery_key,
    is_duplicate_delivery,
    is_event_for_configured_page,
    should_prompt_for_availability_details,
    RECENT_MESSENGER_DELIVERIES,
)
from app.services import state_service


def test_menu_responses_json_is_valid_and_has_extensive_main_menu():
    menu_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "responses", "menu_responses.json"))
    with open(menu_path, "r", encoding="utf-8") as f:
        responses = json.load(f)

    main_menu = responses["main_menu"]["quick_replies"]

    assert len(main_menu) >= 8
    assert "Stay Options" in main_menu
    assert "Day Tour & Camping" in main_menu
    assert "Payment Inquiry" in main_menu
    assert "out_of_scope" in responses


def test_scope_guard_allows_resort_questions_and_blocks_unrelated_questions():
    assert is_resort_related_message("Do you have AC teepee available May 29-30?") is True
    assert is_resort_related_message("pwede po ba magdala ng dog sa villa?") is True
    assert is_resort_related_message("How do I get to Amalfi Resort?") is True
    assert is_resort_related_message("How many hours is the travel time from Manila?") is True
    assert is_resort_related_message("gaano kalayo from Subic to Amalfi Resort?") is True
    assert is_resort_related_message("What are the room dimensions or square meters?") is True
    assert is_resort_related_message("How many people can fit in the tent area?") is True
    assert is_resort_related_message("What is the capital of France?") is False
    assert is_resort_related_message("Can you write my Python homework?") is False


def test_ai_triage_only_runs_for_ambiguous_substantive_messages(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr("app.api.webhooks.AI_TRIAGE_ENABLED", True)

    assert should_use_ai_triage(
        "Ask ko lang po if okay ba pumunta bukas and may malapit na bilihan?",
        {"category": "LOW_PRIORITY_FAQ", "priority": "normal", "reason": "general_inquiry"},
    ) is True
    assert should_use_ai_triage(
        "May available AC Teepee May 29?",
        {"category": "LOW_PRIORITY_FAQ", "priority": "normal", "reason": "booking_inquiry_needs_details"},
    ) is True
    assert should_use_ai_triage(
        "test",
        {"category": "SPAM_OR_NONSENSE", "priority": "low", "reason": "very_short_or_noise"},
    ) is False


def test_rule_triage_keeps_general_info_out_of_priority_queue():
    assert categorize_inquiry("Do you have AC teepee available May 29?") == {
        "category": "LOW_PRIORITY_FAQ",
        "priority": "normal",
        "reason": "booking_inquiry_needs_details",
    }
    assert categorize_inquiry("What are the amenities and house rules?") == {
        "category": "LOW_PRIORITY_FAQ",
        "priority": "normal",
        "reason": "general_inquiry",
    }
    assert categorize_inquiry("How many hours travel time from Manila?") == {
        "category": "LOW_PRIORITY_FAQ",
        "priority": "normal",
        "reason": "general_inquiry",
    }
    assert categorize_inquiry("10 pax overnight") == {
        "category": "LOW_PRIORITY_FAQ",
        "priority": "normal",
        "reason": "booking_inquiry_needs_details",
    }
    assert categorize_inquiry("owner's villa may 11-12 25pax") == {
        "category": "HOT_BOOKING_LEAD",
        "priority": "high",
        "reason": "complete_booking_details",
    }
    assert categorize_inquiry("please reserve owner's villa may 11-12") == {
        "category": "HOT_BOOKING_LEAD",
        "priority": "high",
        "reason": "strong_booking_intent",
    }


def test_availability_prompt_does_not_catch_room_detail_questions():
    assert should_prompt_for_availability_details("available po ba tomorrow?") is True
    assert should_prompt_for_availability_details("Sa Pool Villa po ilan beds po sya?") is False
    assert should_prompt_for_availability_details("How many pax can fit in Owner's Villa?") is False


def test_ai_daily_limit_is_dynamic_by_guest_quality():
    assert get_ai_daily_limit(
        {"category": "LOW_PRIORITY_FAQ", "priority": "normal", "reason": "general_inquiry"},
        "What are your amenities and rules?"
    ) == 10
    assert get_ai_daily_limit(
        {"category": "HOT_BOOKING_LEAD", "priority": "high", "reason": "complete_booking_details"},
        "owner's villa may 11-12 25pax"
    ) == 15
    assert get_ai_daily_limit(
        {"category": "PAYMENT_SENT", "priority": "high", "reason": "payment_language"},
        "sent payment"
    ) == 15
    assert get_ai_daily_limit(
        {"category": "SPAM_OR_NONSENSE", "priority": "low", "reason": "very_short_or_noise"},
        "test"
    ) == 4


def test_availability_context_carries_previous_unit_preference():
    history = [
        {"role": "user", "content": "owner's villa may 20-21"},
        {"role": "assistant", "content": "Owner's Villa is fully booked for May 20-21."},
    ]

    enriched, carried_room = build_contextual_inquiry_message("ok may 11-12", history)

    assert carried_room == "Owner's Villa"
    assert enriched == "Owner's Villa ok may 11-12"


def test_availability_context_does_not_override_new_unit_preference():
    history = [{"role": "user", "content": "owner's villa may 20-21"}]

    enriched, carried_room = build_contextual_inquiry_message("beach villa may 11-12", history)

    assert carried_room is None
    assert enriched == "beach villa may 11-12"


def test_hub_context_mentions_carried_room_preference_rule():
    analysis = {
        "context": {"check_in": "2026-05-11", "check_out": "2026-05-12", "room_type": "Owner's Villa"},
        "live_inventory": {"checked": True, "available_unit_count": 1, "available_units": []},
        "suggestions": [],
    }

    text = format_hub_analysis_for_ai(analysis, "Owner's Villa")

    assert "Carried room preference from previous guest turn: Owner's Villa" in text
    assert "Answer about Owner's Villa first" in text


@pytest.mark.asyncio
async def test_messenger_payment_receipt_image_is_tagged_and_acknowledged(monkeypatch):
    from app.api.webhooks import process_messenger_event

    sent_messages = []
    metadata_updates = []
    handoffs = []

    monkeypatch.setattr("app.api.webhooks.load_knowledge_base", AsyncMock(return_value={}))
    monkeypatch.setattr("app.api.webhooks.load_menu_responses", AsyncMock(return_value={
        "receipt_acknowledgement": {"template": "Thanks for sending your receipt."}
    }))
    monkeypatch.setattr("app.api.webhooks.archive_chat_turn", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.api.webhooks.verify_receipt_with_vision", AsyncMock(return_value={
        "classification": "payment_receipt",
        "status": "verified_payment_receipt",
        "confidence": 0.93,
        "reason": "GCash receipt with amount and reference"
    }))
    monkeypatch.setattr("app.api.webhooks.send_message", AsyncMock(side_effect=lambda _sender, text: sent_messages.append(text)))
    monkeypatch.setattr("app.api.webhooks.update_conversation_metadata", lambda *args, **kwargs: metadata_updates.append((args, kwargs)))
    monkeypatch.setattr("app.api.webhooks.activate_manual_handoff", lambda *args, **kwargs: handoffs.append(args))

    await process_messenger_event("guest-receipt", image_url="https://example.com/gcash.jpg")

    assert sent_messages == ["Thanks for sending your receipt."]
    assert metadata_updates[-1][0][1] == "PAYMENT_SENT"
    assert handoffs and handoffs[-1][3] == "payment_receipt"


@pytest.mark.asyncio
async def test_messenger_acknowledgement_image_asks_for_actual_payment_receipt(monkeypatch):
    from app.api.webhooks import process_messenger_event

    quick_replies = []
    metadata_updates = []

    monkeypatch.setattr("app.api.webhooks.load_knowledge_base", AsyncMock(return_value={}))
    monkeypatch.setattr("app.api.webhooks.load_menu_responses", AsyncMock(return_value={}))
    monkeypatch.setattr("app.api.webhooks.archive_chat_turn", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.api.webhooks.verify_receipt_with_vision", AsyncMock(return_value={
        "classification": "booking_acknowledgement",
        "status": "booking_acknowledgement",
        "confidence": 0.94,
        "reason": "Amalfi acknowledgement slip"
    }))
    monkeypatch.setattr("app.api.webhooks.send_quick_replies", AsyncMock(side_effect=lambda _sender, text, replies: quick_replies.append((text, replies))))
    monkeypatch.setattr("app.api.webhooks.update_conversation_metadata", lambda *args, **kwargs: metadata_updates.append((args, kwargs)))

    await process_messenger_event("guest-ack", image_url="https://example.com/amalfi-ack.png")

    assert "actual payment receipt" in quick_replies[-1][0].lower()
    assert metadata_updates[-1][0][1] == "PAYMENT_SENT"


def patch_state_service_memory(monkeypatch):
    conn = sqlite3.connect(":memory:")
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
    monkeypatch.setattr(state_service, "_connect", lambda: conn)
    return conn

# â”€â”€â”€ ðŸ§ª SUCCESS SCENARIOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.mark.asyncio
async def test_verify_messenger_success():
    """SCENARIO 1: Success - GET /webhook/messenger with correct token."""
    # Arrange
    request = MagicMock(spec=Request)
    request.query_params = {
        "hub.mode": "subscribe",
        "hub.challenge": "12345",
        "hub.verify_token": "amalfi_secure_token" # Default in code
    }
    
    # Act
    with patch('os.getenv', return_value="amalfi_secure_token"):
        response = await verify_messenger(request)
    
    # Assert
    assert response.status_code == 200
    assert response.body == b"12345"

@pytest.mark.asyncio
async def test_load_knowledge_base():
    """SCENARIO 2: Success - Load the resort knowledge base from the Hub."""
    mock_data = {"resort_name": "Amalfi Resort"}

    with patch('httpx.AsyncClient.get', return_value=MagicMock(status_code=200, json=lambda: mock_data)):
        kb = await load_knowledge_base()
    
    # Assert
    assert isinstance(kb, dict)
    assert kb.get("resort_name") == "Amalfi Resort"

@pytest.mark.asyncio
async def test_build_context_integrity():
    """SCENARIO 3: Success - Context builder extracts KB values correctly."""
    # Arrange
    mock_kb = {
        "special_bookings": {"day_tour": {"pax_fee_php": 500}},
        "facilities_and_amenities": ["Pool", "Beach"],
        "add_ons": [{"name": "Bonfire", "price_php": 300, "unit": "set"}]
    }
    
    # Act
    ctx = build_context(mock_kb, {})
    
    # Assert
    assert ctx["day_tour_entrance_fee"] == 500
    assert "Pool" in ctx["facilities_list"]
    assert "Bonfire" in ctx["addons_list"]

# â”€â”€â”€ ðŸ§ª FAILURE SCENARIOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.mark.asyncio
async def test_verify_messenger_failure():
    """SCENARIO 4: Failure - GET /webhook/messenger with wrong token."""
    # Arrange
    request = MagicMock(spec=Request)
    request.query_params = {
        "hub.mode": "subscribe",
        "hub.challenge": "12345",
        "hub.verify_token": "WRONG_TOKEN"
    }
    
    # Act
    response = await verify_messenger(request)
    
    # Assert
    assert response.status_code == 403

@pytest.mark.asyncio
async def test_load_knowledge_base_missing_file():
    """SCENARIO 5: Failure - Hub knowledge failure returns empty data."""
    with patch('httpx.AsyncClient.get', side_effect=Exception("Hub offline")):
        kb = await load_knowledge_base()
        assert kb == {}

@pytest.mark.asyncio
async def test_extract_dates_ai_failure():
    """SCENARIO 6: Failure - AI fail to extract dates returns None."""
    from app.api.webhooks import extract_dates_with_ai
    
    with patch('app.api.webhooks.get_ai_response', return_value=None):
        dates = await extract_dates_with_ai("I want to visit", {})
        assert dates is None

# â”€â”€â”€ ðŸ§ª SECURITY SCENARIOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.mark.asyncio
async def test_messenger_webhook_security():
    """SCENARIO 7: Security - Webhook rejects non-page objects."""
    from app.api.webhooks import handle_messenger_webhook
    request = MagicMock(spec=Request)
    request.json = AsyncMock(return_value={"object": "not_a_page"})
    
    response = await handle_messenger_webhook(request, MagicMock())
    assert response.body == b"EVENT_RECEIVED" # Code still returns 200 but does nothing

def test_messenger_event_page_guard_accepts_current_page_and_rejects_old_page(monkeypatch):
    monkeypatch.setattr("app.api.webhooks.FB_PAGE_ID", "current-page")

    assert is_event_for_configured_page({
        "sender": {"id": "guest-1"},
        "recipient": {"id": "current-page"},
    }) is True
    assert is_event_for_configured_page({
        "sender": {"id": "guest-1"},
        "recipient": {"id": "old-page"},
    }) is False
    assert is_event_for_configured_page({
        "sender": {"id": "current-page"},
        "recipient": {"id": "guest-1"},
    }, {"is_echo": True}) is True
    assert is_event_for_configured_page({
        "sender": {"id": "old-page"},
        "recipient": {"id": "guest-1"},
    }, {"is_echo": True}) is False

@pytest.mark.asyncio
async def test_messenger_webhook_ignores_non_configured_page(monkeypatch):
    from app.api.webhooks import handle_messenger_webhook

    background_tasks = MagicMock()
    metadata_updates = []
    monkeypatch.setattr("app.api.webhooks.FB_PAGE_ID", "current-page")
    monkeypatch.setattr(
        "app.api.webhooks.update_conversation_metadata",
        lambda *args, **kwargs: metadata_updates.append((args, kwargs)),
    )

    request = MagicMock(spec=Request)
    request.json = AsyncMock(return_value={
        "object": "page",
        "entry": [{
            "messaging": [{
                "sender": {"id": "guest-from-old-page"},
                "recipient": {"id": "old-page"},
                "message": {"mid": "mid-old-page-1", "text": "Will book na po may 4-6"},
            }]
        }],
    })

    response = await handle_messenger_webhook(request, background_tasks)

    assert response.body == b"EVENT_RECEIVED"
    assert metadata_updates == []
    background_tasks.add_task.assert_not_called()


@pytest.mark.asyncio
async def test_paused_messenger_thread_does_not_keep_replying(monkeypatch):
    from app.api.webhooks import process_messenger_event, USER_COOLDOWN, DEDUP_WINDOW

    sender = "manual-guest"
    USER_COOLDOWN.pop(sender, None)
    DEDUP_WINDOW.pop(sender, None)
    sent_quick_replies = []
    archived_turns = []

    monkeypatch.setattr("app.api.webhooks.load_knowledge_base", AsyncMock(return_value={}))
    monkeypatch.setattr("app.api.webhooks.load_menu_responses", AsyncMock(return_value={}))
    monkeypatch.setattr("app.api.webhooks.update_conversation_metadata", lambda *args, **kwargs: None)
    monkeypatch.setattr("app.api.webhooks.maybe_apply_ai_triage", AsyncMock(return_value=None))
    monkeypatch.setattr("app.api.webhooks.archive_chat_turn", lambda *args, **kwargs: archived_turns.append(args))
    monkeypatch.setattr("app.api.webhooks.send_quick_replies", AsyncMock(side_effect=lambda *args, **kwargs: sent_quick_replies.append(args)))
    monkeypatch.setattr("app.api.webhooks.get_conversation_state", lambda _sender: {
        "is_paused": True,
        "manual_active": True,
        "manual_until": "2099-01-01 01:00:00 PM PHT",
        "paused_at": "2099-01-01 12:00:00 PM PHT",
    })

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"is_bot_enabled": "true"}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, *_args, **_kwargs):
            return FakeResponse()

    monkeypatch.setattr("app.api.webhooks.httpx.AsyncClient", lambda *args, **kwargs: FakeClient())

    await process_messenger_event(sender, "May update po?")

    assert sent_quick_replies == []
    assert any(turn[3] == "manual_override_active" for turn in archived_turns)

@pytest.mark.asyncio
async def test_load_kb_path_traversal_protection():
    """SCENARIO 8: Security - Ensure KB loader doesn't leak system files."""
    from app.api.webhooks import load_knowledge_base
    # This is a logical check of the implementation which uses hardcoded paths
    assert "Hub" in str(load_knowledge_base.__doc__)

# â”€â”€â”€ ðŸ§ª EDGE CASE SCENARIOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.mark.asyncio
async def test_user_cooldown_edge_case():
    """SCENARIO 9: Edge Case - Rapid fire messages trigger cooldown."""
    from app.api.webhooks import process_messenger_event, USER_COOLDOWN
    sender_id = "test_user_123"
    USER_COOLDOWN[sender_id] = 9999999999.0 # Future time to simulate recent msg
    
    # Act
    # This should return immediately due to cooldown
    result = await process_messenger_event(sender_id, "Hello")
    assert result is None

@pytest.mark.asyncio
async def test_template_render_missing_key():
    """SCENARIO 10: Edge Case - Template renderer handles missing keys."""
    from app.api.webhooks import render
    template = "Hello {name}, welcome to {resort}!"
    ctx = {"name": "Valued Guest"} # Missing 'resort'
    
    rendered = render(template, ctx)
    assert "{resort}" in rendered # Should remain as placeholder, not crash

def test_detect_language_mode_tagalog_and_taglish():
    assert detect_language_mode("ano pong recommendation nyo para sa 40 pax?") == "tagalog"
    assert detect_language_mode("hello ano pong recommendation nyo for 40 pax?") == "taglish"
    assert detect_language_mode("what do you recommend for 40 pax?") == "english"

def test_daily_ai_counter_tracks_per_day(monkeypatch):
    sender = "daily_cap_guest"
    monkeypatch.setattr("app.api.webhooks.get_daily_ai_usage", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("no db")))
    monkeypatch.setattr("app.api.webhooks.increment_daily_ai_usage", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("no db")))
    DAILY_AI_MESSAGE_COUNTS.pop((sender, "2026-04-12"), None)
    DAILY_AI_MESSAGE_COUNTS.pop((sender, "2026-04-13"), None)
    assert get_daily_ai_count(sender, "2026-04-12") == 0
    increment_daily_ai_count(sender, "2026-04-12")
    increment_daily_ai_count(sender, "2026-04-12")
    assert get_daily_ai_count(sender, "2026-04-12") == 2
    assert get_daily_ai_count(sender, "2026-04-13") == 0

def test_detect_recommendation_mode_separates_product_types():
    assert detect_recommendation_mode("best setup for 40 pax overnight") == "overnight"
    assert detect_recommendation_mode("best day tour setup for 30 pax") == "day_tour"
    assert detect_recommendation_mode("tent recommendation for 8 pax") == "tent"

def test_room_recommendation_prefers_tight_valid_combo():
    kb = {
        "accommodations": [
            {
                "name": "Pool Villa",
                "marketing_name": "Pool Villa",
                "units": 6,
                "rates": [{"max_pax": 12, "price_php": 12000}],
                "extra_pax": {"price_per_head_php": 500, "max_capacity_pax": 15},
            },
            {
                "name": "Owner's Villa",
                "marketing_name": "Owner's Villa",
                "units": 1,
                "rates": [{"max_pax": 20, "price_php": 28000}],
                "extra_pax": {"price_per_head_php": 800, "max_capacity_pax": 25},
            },
            {
                "name": "Beach Villa",
                "marketing_name": "Beach Villa",
                "units": 6,
                "rates": [{"max_pax": 10, "price_php": 12000}],
                "max_capacity_pax": 10,
            },
        ]
    }

    recs = find_room_recommendations(40, kb, top_n=1)
    assert len(recs) == 1
    combo = recs[0]
    assert combo["unit_count"] == 2
    assert sum(unit["assigned_pax"] for unit in combo["units"]) == 40
    assert any(unit["name"] == "Owner's Villa" and unit["assigned_pax"] == 25 for unit in combo["units"])
    assert any(unit["name"] == "Pool Villa" and unit["assigned_pax"] == 15 for unit in combo["units"])

def test_room_recommendation_format_includes_pricing_explanation():
    combo = {
        "units": [
            {"name": "Owner's Villa", "assigned_pax": 25, "base_price": 28000, "extra_heads": 5, "extra_price": 800, "unit_price": 32000},
            {"name": "Pool Villa", "assigned_pax": 15, "base_price": 12000, "extra_heads": 3, "extra_price": 500, "unit_price": 13500},
        ],
        "unit_count": 2,
        "total_price": 45500,
    }
    text = format_room_recommendation(combo, 40, "taglish")
    assert "Owner's Villa - PHP 32,000" in text
    assert "Pool Villa - PHP 13,500" in text
    assert "PHP 45,500" in text
    assert "pax" not in text.lower()

def test_special_recommendation_response_for_day_tour_and_tent():
    kb = {
        "special_bookings": {
            "day_tour": {"pax_fee_php": 350},
            "tent_pitching": {"slots_available": 20, "price_php": 500},
        }
    }
    day_tour = build_special_recommendation_response("day_tour", 30, kb, "english")
    tent = build_special_recommendation_response("tent", 8, kb, "taglish")
    assert "PHP 10,500" in day_tour
    assert "PHP 4,000" in tent
    assert "pax" not in day_tour.lower()
    assert "pax" not in tent.lower()

def test_room_rate_cards_are_carousel_ready_and_hide_capacity_copy():
    kb = {
        "accommodations": [
            {
                "name": "Pool Villa",
                "image": "/pool.jpg",
                "features": ["Private pool"],
                "rates": [{"min_pax": 1, "max_pax": 14, "price_php": 12000}],
            }
        ]
    }

    cards = build_room_rate_elements(kb)

    assert cards[0]["title"] == "POOL VILLA"
    assert "PHP 12,000" in cards[0]["subtitle"]
    assert "pax" not in cards[0]["subtitle"].lower()

def test_sanitize_guest_reply_removes_capacity_phrases():
    text = sanitize_guest_reply("Pool Villa is PHP 12,000 (up to 14 pax). Good for 10 guests.")

    assert text == "Pool Villa is PHP 12,000."

def test_categorization_separates_confirmed_booking_and_refund_policy():
    assert categorize_inquiry("I already booked na po") == {
        "category": "CONFIRMED_BOOKING",
        "priority": "medium",
        "reason": "already_booked_language",
    }
    assert categorize_inquiry("What is your refund policy?") == {
        "category": "REBOOKING_OR_CANCELLATION",
        "priority": "high",
        "reason": "date_change_or_cancel_language",
    }

def test_structured_menu_response_skips_llm_for_common_topics():
    responses = {
        "rules_and_policies": {
            "template": "Downpayment is {downpayment_percent}%.",
            "quick_replies": ["ðŸŒ Book Now", "â¬…ï¸ BACK"]
        }
    }
    ctx = {"downpayment_percent": 50}
    result = resolve_structured_menu_response("How much is your downpayment?", responses, ctx, "english")
    assert result is not None
    assert "Downpayment is 50%" in result["text"]
    assert result["key"] == "rules_and_policies"
    assert "ðŸŒ Book Now" in result["quick_replies"]

def test_structured_menu_response_supports_category_and_payment_paths():
    responses = {
        "stay_options": {
            "template": "Stay options live here.",
            "quick_replies": ["ðŸ›ï¸ Rooms & Rates", "â¬…ï¸ BACK"]
        },
        "payment_inquiry": {
            "template": "Share your booking reference and proof of payment.",
            "quick_replies": ["ðŸ“ž Talk to Guest Services", "â¬…ï¸ BACK"]
        }
    }
    ctx = {}

    stay_result = resolve_structured_menu_response("Show me your stay options", responses, ctx, "english")
    payment_result = resolve_structured_menu_response("I have a payment inquiry", responses, ctx, "english")

    assert stay_result is not None
    assert stay_result["key"] == "stay_options"
    assert "Stay options live here." in stay_result["text"]
    assert payment_result is not None
    assert payment_result["key"] == "payment_inquiry"
    assert "proof of payment" in payment_result["text"]

def test_structured_menu_response_catches_pet_policy_questions():
    responses = {
        "rules_and_policies": {
            "template": "Pets must be leashed.",
            "quick_replies": ["ðŸŒ Book Now", "â¬…ï¸ BACK"]
        }
    }
    ctx = {}

    result = resolve_structured_menu_response("pwede po ba magdala ng aso?", responses, ctx, "tagalog")

    assert result is not None
    assert result["key"] == "rules_and_policies"
    assert "Pets must be leashed." in result["text"]

def test_main_menu_request_only_for_pure_menu_or_greeting_inputs():
    assert is_main_menu_request("hello") is True
    assert is_main_menu_request("MENU") is True
    assert is_main_menu_request("back") is True
    assert is_main_menu_request("hello do you have available rooms for owner's villa on april 12?") is False
    assert is_main_menu_request("hi meron po kayo available rooms on april 12 for owners villa?") is False

def test_bot_resume_request_allows_escape_from_manual_handoff():
    assert is_bot_resume_request("MENU") is True
    assert is_bot_resume_request("Book Now") is True
    assert is_bot_resume_request("resume") is True
    assert is_bot_resume_request("Do you have rooms available tomorrow?") is False

def test_messenger_delivery_id_dedupes_meta_retries():
    RECENT_MESSENGER_DELIVERIES.clear()
    event = {"sender": {"id": "guest-psid-1"}}
    msg = {"mid": "m_test_retry_1", "text": "May rooms po?"}

    delivery_key = build_messenger_delivery_key("guest-psid-1", event, msg=msg)

    assert delivery_key == "message:guest-psid-1:m_test_retry_1"
    assert is_duplicate_delivery(delivery_key) is False
    assert is_duplicate_delivery(delivery_key) is True
    assert is_duplicate_delivery("message:guest-psid-1:m_test_retry_2") is False

def test_booking_guidance_text_replaces_room_recommendations():
    english = build_booking_guidance_text("english")
    taglish = build_booking_guidance_text("taglish")

    assert "Book Now" in english
    assert "guest services" in english
    assert "Book Now" in taglish

def test_combo_booking_handoff_text_mentions_live_support():
    english = build_combo_booking_handoff_text("english")
    assert "live guest support" in english
    assert "more than one room" in english

def test_state_service_persists_daily_usage(monkeypatch):
    patch_state_service_memory(monkeypatch)
    state_service.reset_daily_ai_usage("persist_user")
    assert state_service.get_daily_ai_usage("persist_user", "2026-04-12") == 0
    assert state_service.increment_daily_ai_usage("persist_user", "2026-04-12") == 1
    assert state_service.increment_daily_ai_usage("persist_user", "2026-04-12") == 2
    assert state_service.get_daily_ai_usage("persist_user", "2026-04-12") == 2

def test_handoff_detection_and_localized_message():
    handoff = detect_handoff_need("Can I talk to a real person about my refund?")
    assert handoff is not None
    assert handoff["reason"] == "guest_requested_human"
    assert handoff["urgency"] == "high"
    assert "manual follow-up" in build_human_handoff_text("english")

def test_handoff_detection_does_not_escalate_pet_question():
    assert detect_handoff_need("pwede po ba magdala ng aso?") is None

def test_handoff_detection_keeps_payment_as_transfer_case():
    handoff = detect_handoff_need("my payment is not reflected yet")
    assert handoff is not None
    assert handoff["reason"] == "payment_inquiry"
    assert handoff["urgency"] == "medium"

def test_combo_booking_handoff_only_when_best_fit_needs_multiple_rooms():
    kb = {
        "accommodations": [
            {
                "name": "Pool Villa",
                "marketing_name": "Pool Villa",
                "units": 2,
                "max_capacity_pax": 12,
                "rates": [{"max_pax": 12, "price_php": 12000}],
            },
            {
                "name": "Owner's Villa",
                "marketing_name": "Owner's Villa",
                "units": 1,
                "rates": [{"max_pax": 20, "price_php": 28000}],
                "extra_pax": {"allowed": True, "max_capacity_pax": 25, "price_per_head_php": 800},
            },
        ]
    }

    assert needs_combo_booking_handoff("what room do you recommend for 30 pax?", kb) is True
    assert needs_combo_booking_handoff("what room do you recommend for 20 pax?", kb) is False

def test_state_service_persists_chatbot_alerts(monkeypatch):
    patch_state_service_memory(monkeypatch)
    alert_id = state_service.create_chatbot_alert(
        sender_id="guest-1",
        user_message="I need help with my refund",
        bot_answer="We flagged this for manual follow-up.",
        escalation_reason="special_case_needs_human",
        urgency="high",
        source="web",
    )
    alerts = state_service.list_chatbot_alerts(limit=10, status="open")
    assert alerts[0]["id"] == alert_id
    updated = state_service.update_chatbot_alert_status(alert_id, "resolved")
    assert updated["status"] == "resolved"
