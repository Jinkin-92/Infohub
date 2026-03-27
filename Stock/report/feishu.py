"""Feishu webhook sender."""

from __future__ import annotations

import requests

from config.runtime_settings import settings


def send_text_message(message: str, webhook_url: str | None = None, timeout: int = 15) -> dict:
    url = webhook_url or settings.notification.feishu_webhook_url
    if not url:
        return {"ok": False, "detail": "FEISHU_WEBHOOK_URL is not configured"}

    response = requests.post(
        url,
        json={"msg_type": "text", "content": {"text": message}},
        timeout=timeout,
    )
    response.raise_for_status()
    return {"ok": True, "detail": response.text}


def send_post_message(title: str, content_lines: list[str], webhook_url: str | None = None, timeout: int = 15) -> dict:
    url = webhook_url or settings.notification.feishu_webhook_url
    if not url:
        return {"ok": False, "detail": "FEISHU_WEBHOOK_URL is not configured"}
    payload = {
        "msg_type": "post",
        "content": {
            "post": {
                "zh_cn": {
                    "title": title,
                    "content": [[{"tag": "text", "text": line}] for line in content_lines],
                }
            }
        },
    }
    response = requests.post(url, json=payload, timeout=timeout)
    response.raise_for_status()
    return {"ok": True, "detail": response.text}
