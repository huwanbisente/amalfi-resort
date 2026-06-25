import httpx
import os

FB_API_URL = os.getenv("FB_API_URL", "https://graph.facebook.com/v19.0/me/messages")
FB_PAGE_ACCESS_TOKEN = os.getenv("FB_PAGE_ACCESS_TOKEN", "")

async def send_message(recipient_id: str, text: str) -> bool:
    """
    Sends a standard text message to the user.
    """
    data = {
        "recipient": {"id": recipient_id},
        "message": {"text": text}
    }
    return await _send_payload(data)

async def send_image(recipient_id: str, image_url: str) -> bool:
    """
    Sends an image attachment.
    """
    data = {
        "recipient": {"id": recipient_id},
        "message": {
            "attachment": {
                "type": "image",
                "payload": {"url": image_url, "is_reusable": True}
            }
        }
    }
    return await _send_payload(data)

async def send_button_template(recipient_id: str, text: str, button_title: str, url: str):
    """Sends a message with a URL button."""
    data = {
        "recipient": {"id": recipient_id},
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "button",
                    "text": text,
                    "buttons": [
                        {
                            "type": "web_url",
                            "url": url,
                            "title": button_title
                        }
                    ]
                }
            }
        }
    }
    return await _send_payload(data)

async def send_generic_template(recipient_id: str, title: str, subtitle: str, image_url: str, buttons: list[dict]=None):
    """Sends a card with image, title, and subtitle."""
    element = {"title": title, "subtitle": subtitle, "image_url": image_url}
    if buttons: element["buttons"] = buttons
    return await send_generic_carousel(recipient_id, [element])

async def send_generic_carousel(recipient_id: str, elements: list[dict]):
    """Sends a horizontal Messenger carousel of generic template cards."""
    safe_elements = []
    for element in elements[:10]:
        title = str(element.get("title") or "").strip()[:80]
        subtitle = str(element.get("subtitle") or "").strip()[:80]
        image_url = str(element.get("image_url") or "").strip()
        if not title:
            continue
        safe_element = {"title": title}
        if subtitle:
            safe_element["subtitle"] = subtitle
        if image_url:
            safe_element["image_url"] = image_url
        buttons = element.get("buttons")
        if buttons:
            safe_element["buttons"] = buttons[:3]
        safe_elements.append(safe_element)

    if not safe_elements:
        return False

    data = {
        "recipient": {"id": recipient_id},
        "message": {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "generic",
                    "elements": safe_elements
                }
            }
        }
    }
    return await _send_payload(data)

async def send_quick_replies(recipient_id: str, text: str, options: list[str]):
    """Sends a message with quick reply button options."""
    data = {
        "recipient": {"id": recipient_id},
        "message": {
            "text": text,
            "quick_replies": [
                {
                    "content_type": "text",
                    "title": option,
                    "payload": f"MENU_{option.upper().replace(' ', '_')}"
                } for option in options
            ]
        }
    }
    return await _send_payload(data)

async def send_sender_action(recipient_id: str, action: str) -> bool:
    """
    Sends a sender action (mark_seen, typing_on, typing_off).
    """
    data = {
        "recipient": {"id": recipient_id},
        "sender_action": action
    }
    return await _send_payload(data)

async def mark_seen(recipient_id: str):
    return await send_sender_action(recipient_id, "mark_seen")

async def typing_on(recipient_id: str):
    return await send_sender_action(recipient_id, "typing_on")

async def typing_off(recipient_id: str):
    return await send_sender_action(recipient_id, "typing_off")

async def _send_payload(data: dict) -> bool:
    params = {"access_token": FB_PAGE_ACCESS_TOKEN}
    headers = {"Content-Type": "application/json"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                FB_API_URL,
                params=params,
                headers=headers,
                json=data
            )
            
            if response.status_code == 200:
                print(f"âœ… Successfully sent message payload to {data['recipient']['id']}")
                return True
            else:
                # Only print error if it's not a success, to keep logs cleaner
                print(f"Failed to send message: {response.text}")
                return False
    except Exception as e:
        print(f"Exception while sending message: {str(e)}")
        return False
