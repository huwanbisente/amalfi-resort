import os
import httpx
import json
import re
from typing import List, Optional
from pydantic import BaseModel, Field

# OpenRouter Configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
# Upgrade to a better model as seen in the working backup
LLAMA_MODEL = "meta-llama/llama-3.3-70b-instruct:free"
APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://localhost:8001")

# Hub Knowledge Pull (Removed internal fetcher as webhooks.py should manage its own context)

class BotResponse(BaseModel):
    text: str = Field(description="The conversational text response to the user.")
    intent: str = Field(description="The detected user intent (e.g., 'booking', 'pricing', 'general').")
    guest_name: Optional[str] = Field(description=None)
    detected_language: Optional[str] = Field(description=None)
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    link_title: Optional[str] = None

async def get_ai_response(user_message: str, history: List[dict] = None, system_prompt: str = "", language: str = "auto", image_url: str = None) -> BotResponse | None:
    """Primary LLM entry point with Layer 2 Fallback and History-Safe Recovery (Aligned with 'fix' version)."""
    try:
        # ðŸŸ¢ LAYER 1: OpenAI (Primary)
        print("ðŸ¤– [L1] Attempting OpenAI (gpt-4o-mini)...")
        response = await _call_openai(user_message, history, system_prompt, language, image_url)
        if response:
            return response
            
        print("âš ï¸ LAYER 1 (OpenAI) FAILED. Falling back to LAYER 2 (OpenRouter)...")
        
        # ðŸŸ¡ LAYER 2: OpenRouter (Backup)
        print(f"ðŸ¤– [L2] Falling back to OpenRouter ({LLAMA_MODEL})...")
        response = await _call_openrouter(user_message, history, system_prompt, language)
        if response:
            return response

        # ðŸŸ  LAYER 3: Self-Healing (Retry Primary WITHOUT history)
        if history and len(history) > 0:
            print("ðŸ”§ SELF-HEALING: AI failed with history. Retrying without conversation context...")
            response = await _call_openai(user_message, [], system_prompt, language)
            if response:
                return response

    except Exception as e:
        import traceback
        print("ðŸ”¥ CRITICAL AI SYSTEM ERROR:")
        print(traceback.format_exc())
    
    print("âŒ ALL AI LAYERS FAILED. Dropping to Lite Mode.")
    return None

async def verify_receipt_with_vision(image_url: str) -> dict:
    """Classify a Messenger image as payment proof, Amalfi acknowledgement, or non-receipt."""
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key or not image_url:
        return {
            "classification": "unknown",
            "status": "manual_review",
            "confidence": 0,
            "reason": "Receipt vision is unavailable."
        }

    prompt = (
        "Classify this image for Amalfi Resort chat payment handling. Return JSON only with keys: "
        "classification, payment_method, has_amount, amount, has_reference, reference_number, confidence, reason. "
        "classification must be one of: payment_receipt, booking_acknowledgement, not_receipt, unknown. "
        "Use payment_receipt only for real GCash, bank transfer, e-wallet, or payment proof screenshots. "
        "Use booking_acknowledgement if it is a Amalfi booking acknowledgement/slip and not actual payment proof. "
        "A payment receipt should show an amount and transaction/reference number."
    )
    payload = {
        "model": os.getenv("RECEIPT_AI_MODEL", "gpt-4o-mini"),
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 260,
        "messages": [
            {"role": "system", "content": "You are a strict receipt classifier. Do not call resort acknowledgement slips payment receipts."},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            },
        ],
    }
    headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
        if resp.status_code != 200:
            return {
                "classification": "unknown",
                "status": "manual_review",
                "confidence": 0,
                "reason": f"Receipt vision failed with HTTP {resp.status_code}.",
            }
        raw = resp.json()["choices"][0]["message"]["content"]
        data = json.loads(raw)
        classification = str(data.get("classification") or "unknown").lower()
        confidence = max(0, min(1, float(data.get("confidence") or 0)))
        has_amount = bool(data.get("has_amount"))
        has_reference = bool(data.get("has_reference"))
        is_payment = classification == "payment_receipt" and has_amount and has_reference and confidence >= 0.65
        return {
            "classification": classification,
            "status": "verified_payment_receipt" if is_payment else classification,
            "payment_method": str(data.get("payment_method") or "unknown").lower(),
            "has_amount": has_amount,
            "amount": data.get("amount"),
            "has_reference": has_reference,
            "reference_number": data.get("reference_number"),
            "confidence": confidence,
            "reason": str(data.get("reason") or "")[:240],
        }
    except Exception as exc:
        return {
            "classification": "unknown",
            "status": "manual_review",
            "confidence": 0,
            "reason": f"Receipt vision failed: {exc}",
        }

async def _call_openrouter(user_message: str, history: List[dict], system_prompt: str, language: str) -> BotResponse | None:
    """Backup via OpenRouter."""
    if not OPENROUTER_API_KEY:
        return None

    headers = { 
        "Authorization": f"Bearer {OPENROUTER_API_KEY}", 
        "Content-Type": "application/json",
        "HTTP-Referer": APP_PUBLIC_URL,
        "X-OpenRouter-Title": "Project Amalfi Chatbot"
    }
    
    chat_history = []
    for turn in (history or []):
        role = turn.get("role", "user").lower()
        content = turn.get("content", "")
        if role in ["model", "bot", "ai"]: role = "assistant"
        chat_history.append({"role": role, "content": str(content)})
    
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history)
    messages.append({"role": "user", "content": user_message})

    payload = { "model": LLAMA_MODEL, "messages": messages, "temperature": 0.4, "max_tokens": 500 }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            if resp.status_code == 200:
                result = resp.json()
                raw_content = result['choices'][0]['message']['content']
                return _parse_bot_response(raw_content)
            else:
                print(f"L2 Error (OpenRouter): {resp.status_code} - {resp.text}")
    except Exception as e:
        import traceback
        print(f"L2 Exception: {e}")
        # Proactively check if the response was successful but empty of choices
        try:
            if 'resp' in locals():
                print(f"RAW OPENROUTER RESPONSE: {resp.text[:500]}")
        except:
                pass
    return None

async def _call_openai(user_message: str, history: List[dict], system_prompt: str, language: str, image_url: str = None) -> BotResponse | None:
    """Primary via OpenAI with Vision support."""
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if not openai_key:
        return None

    api_url = "https://api.openai.com/v1/chat/completions"
    headers = { "Authorization": f"Bearer {openai_key}", "Content-Type": "application/json" }
    
    chat_history = []
    for turn in (history or []):
        role = turn.get("role", "user").lower()
        content = turn.get("content", "")
        if role in ["model", "bot", "ai"]: role = "assistant"
        chat_history.append({"role": role, "content": str(content)})
    
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_history)
    
    # ðŸ–¼ï¸ Structure content for Vision support
    if image_url:
        content = [
            {"type": "text", "text": user_message or "Analyze this image in the context of our resort booking."},
            {"type": "image_url", "image_url": {"url": image_url}}
        ]
    else:
        content = user_message

    messages.append({"role": "user", "content": content})

    payload = { 
        "model": "gpt-4o-mini", 
        "messages": messages, 
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
        "max_tokens": 500
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(api_url, headers=headers, json=payload)
            if resp.status_code == 200:
                result = resp.json()
                raw_content = result['choices'][0]['message']['content']
                return _parse_bot_response(raw_content)
            else:
                print(f"L1 Error (OpenAI): {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"L1 Exception: {e}")
    return None

def _parse_bot_response(raw_content: str) -> BotResponse | None:
    """Robust JSON parsing for the RAG Agent."""
    try:
        # Handle cases where model adds markdown ticks
        clean_content = raw_content.strip()
        if clean_content.startswith("```json"):
            clean_content = clean_content.split("```json")[1].split("```")[0].strip()
        elif clean_content.startswith("```"):
            clean_content = clean_content.split("```")[1].split("```")[0].strip()
            
        data = json.loads(clean_content)
        return BotResponse(
            text=data.get("text", ""),
            intent=data.get("intent", "general"),
            guest_name=data.get("guest_name"),
            detected_language=data.get("detected_language"),
            image_url=data.get("image_url"),
            link_url=data.get("link_url"),
            link_title=data.get("link_title")
        )
    except Exception as e:
        print(f"Error parsing robot response: {e}\nRaw content: {raw_content}")
        # Manual Rescue
        if '"text":' in raw_content:
            try:
                txt = re.findall(r'"text":\s*"(.*?)"', raw_content, re.DOTALL)[0]
                return BotResponse(text=txt, intent="general")
            except:
                pass
    return None
