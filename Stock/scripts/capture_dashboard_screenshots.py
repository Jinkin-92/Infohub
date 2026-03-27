from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright


OUT_DIR = Path(__file__).resolve().parent.parent / "design_review"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def capture() -> None:
    port = os.getenv("DASHBOARD_CAPTURE_PORT", "8509")
    strategy_name = os.getenv("DASHBOARD_CAPTURE_STRATEGY", "中国版永久组合")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1400}, device_scale_factor=1)
        page.goto(f"http://127.0.0.1:{port}", wait_until="networkidle")
        page.screenshot(path=str(OUT_DIR / "dashboard-overview-live-v2.png"), full_page=True)

        page.locator('[data-baseweb="select"]').click()
        page.get_by_text(strategy_name, exact=True).last.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT_DIR / "dashboard-detail-live-v2.png"), full_page=True)

        print(page.locator("body").inner_text()[:4000])
        browser.close()


if __name__ == "__main__":
    capture()
