import sys
import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# Add the chatbot app to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.webhooks import (
    looks_like_availability_question,
    extract_dates_with_ai,
    fetch_availability,
    fetch_hub_inquiry_analysis,
    format_availability_for_ai,
    format_hub_analysis_for_ai,
)

# â”€â”€â”€ ðŸ§ª AVAILABILITY DETECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_availability_detection_logic():
    """Verify that the bot correctly identifies availability questions."""
    assert looks_like_availability_question("Is there a room available on May 10?") is True
    assert looks_like_availability_question("how much for a day tour?") is True # day tour keywords
    assert looks_like_availability_question("meron ba slot sa july?") is True
    assert looks_like_availability_question("hello how are you") is False

# â”€â”€â”€ ðŸ§ª DATE EXTRACTION (AI MOCK) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.mark.asyncio
async def test_extract_dates_with_ai_mock():
    """Verify that date extraction logic handles AI response correctly."""
    mock_ai_response = MagicMock()
    mock_ai_response.text = '{"check_in": "2026-05-10", "check_out": "2026-05-12", "found": true}'
    with patch('app.api.webhooks.get_ai_response', new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_ai_response
        dates = await extract_dates_with_ai("I want to stay from May 10 to 12", {})
        assert dates["check_in"] == "2026-05-10"
        assert dates["check_out"] == "2026-05-12"

# â”€â”€â”€ ðŸ§ª BACKEND FETCH (HTTPX MOCK) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.mark.asyncio
async def test_fetch_availability_success():
    """Verify that fetch_availability correctly calls the Hub API."""
    mock_data = {"check_in": "2026-05-10", "availability": []}
    
    with patch('httpx.AsyncClient.get', return_value=MagicMock(status_code=200, json=lambda: mock_data)):
        result = await fetch_availability("2026-05-10", "2026-05-12")
        assert result["check_in"] == "2026-05-10"

# â”€â”€â”€ ðŸ§ª FORMATTING LOGIC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_format_availability_for_ai():
    """Verify that raw backend data is formatted clearly for the LLM."""
    mock_avail = {
        "check_in": "2026-05-10",
        "check_out": "2026-05-12",
        "availability": [
            {
                "room_type": "AC Teepee",
                "marketing_name": "Cozy Teepee",
                "price": 2500,
                "is_available": True,
                "available_units": 2,
                "units": [{"unit_id": "ACT-01", "status": "AVAILABLE"}]
            },
            {
                "room_type": "Pool Villa",
                "is_available": False,
                "price": 3500,
                "available_units": 0
            }
        ]
    }
    
    formatted = format_availability_for_ai(mock_avail)
    assert "AC Teepee" in formatted
    assert "âœ… 2 unit(s) available" in formatted
    assert "âŒ FULLY BOOKED" in formatted
    assert "Pool Villa" in formatted

@pytest.mark.asyncio
async def test_fetch_hub_inquiry_analysis_success():
    """Verify that the chatbot can call the shared Hub inquiry brain."""
    mock_data = {
        "context": {"check_in": "2026-05-01", "check_out": "2026-05-02", "guests": 6},
        "live_inventory": {"checked": True, "available_unit_count": 1, "available_units": []},
        "suggestions": [],
        "analysis_engine": "hub_inquiry_brain_v1",
    }

    with patch('httpx.AsyncClient.post', return_value=MagicMock(status_code=200, json=lambda: mock_data)):
        result = await fetch_hub_inquiry_analysis("Room rate for 6 pax May 1-2")
        assert result["context"]["check_in"] == "2026-05-01"
        assert result["live_inventory"]["checked"] is True

def test_format_hub_analysis_for_ai():
    """Verify Hub inquiry analysis is formatted as strict LLM context."""
    formatted = format_hub_analysis_for_ai({
        "context": {"check_in": "2026-05-01", "check_out": "2026-05-02", "guests": 6},
        "live_inventory": {
            "checked": True,
            "available_unit_count": 1,
            "available_units": [
                {
                    "unit_id": "pool-villa-1",
                    "unit_label": "Pool Villa #1",
                    "room_type": "Pool Villa",
                    "nightly_rate": 18000,
                    "absolute_max_pax": 15,
                }
            ],
        },
        "suggestions": [
            {
                "mode": "solo",
                "summary": {"total_units": 1, "total_amount": 18000},
                "units": [
                    {
                        "unit_label": "Pool Villa #1",
                        "room_type": "Pool Villa",
                        "assigned_guests": 6,
                        "total_amount": 18000,
                    }
                ],
            }
        ],
        "analysis_engine": "hub_inquiry_brain_v1",
    })

    assert "Detected check-in: 2026-05-01" in formatted
    assert "Detected check-out: 2026-05-02" in formatted
    assert "Detected pax: 6" in formatted
    assert "Pool Villa #1" in formatted
    assert "PHP 18,000" in formatted

# â”€â”€â”€ ðŸ§ª SPAM PROTECTION (COOLDOWN) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.mark.asyncio
async def test_anti_spam_cooldown_trigger():
    """Verify that rapid-fire messages are blocked by the cooldown."""
    from app.api.webhooks import process_messenger_event, USER_COOLDOWN
    import time
    
    sender_id = "spammer_99"
    USER_COOLDOWN[sender_id] = time.time() # Just sent a message
    
    # Second message immediately after should return None (blocked)
    result = await process_messenger_event(sender_id, "Spam message")
    assert result is None
