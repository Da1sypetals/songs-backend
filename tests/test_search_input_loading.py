import glob
import os
import sys
import threading
import time
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:3099")


def launch_browser(p):
    candidates = sorted(
        glob.glob(
            os.path.expanduser(
                "~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell"
            )
        ),
        reverse=True,
    )
    if candidates:
        return p.chromium.launch(headless=True, executable_path=candidates[0])
    return p.chromium.launch(headless=True)


def test_typing_before_hydration_is_preserved():
    release_chunks = threading.Event()
    held_routes = []

    with sync_playwright() as p:
        browser = launch_browser(p)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        def handle_chunks(route):
            if not release_chunks.is_set():
                held_routes.append(route)
            else:
                route.continue_()

        page.route("**/_next/static/chunks/**/*.js", handle_chunks)

        page.goto(BASE_URL, wait_until="domcontentloaded")

        name_input = page.locator('input[placeholder*="搜索歌名"]')
        singer_input = page.locator('input[placeholder*="搜索歌手"]')
        tag_input = page.locator('input[placeholder*="搜索标签"]')
        name_input.wait_for(state="visible", timeout=15000)

        # 在前端 JS 尚未完成 hydration 时立刻在三个搜索框输入关键词
        name_input.click()
        name_input.type("qing")
        singer_input.click()
        singer_input.type("zhou")
        tag_input.click()
        tag_input.type("pop")

        assert name_input.input_value() == "qing"
        assert singer_input.input_value() == "zhou"
        assert tag_input.input_value() == "pop"

        # 放行所有 JS chunk，让 React 完成 hydration 并加载歌曲数据
        release_chunks.set()
        for route in list(held_routes):
            route.continue_()
        held_routes.clear()

        # 等待加载提示消失，确保歌曲列表加载完成
        page.locator("text=正在加载歌曲...").wait_for(state="hidden", timeout=30000)
        page.wait_for_timeout(400)

        after_name = name_input.input_value()
        after_singer = singer_input.input_value()
        after_tag = tag_input.input_value()
        print(
            f"[场景1 加载完成后] 歌名={after_name!r}, 歌手={after_singer!r}, 标签={after_tag!r}"
        )

        assert after_name == "qing", (
            f"加载完成后歌名输入框内容被吞掉，期望 'qing'，实际为 {after_name!r}"
        )
        assert after_singer == "zhou", (
            f"加载完成后歌手输入框内容被吞掉，期望 'zhou'，实际为 {after_singer!r}"
        )
        assert after_tag == "pop", (
            f"加载完成后标签输入框内容被吞掉，期望 'pop'，实际为 {after_tag!r}"
        )

        # 确认筛选条件卡片同步生效
        assert page.locator("span", has_text="qing").first.is_visible(), "歌名筛选条件未生效"
        assert page.locator("span", has_text="zhou").first.is_visible(), "歌手筛选条件未生效"
        assert page.locator("span", has_text="pop").first.is_visible(), "标签筛选条件未生效"

        # 加载完成后继续追加输入，确认不会错乱
        name_input.click()
        name_input.type("tian")
        assert name_input.input_value() == "qingtian"

        # 确认清除按钮可以正常清空三个输入框
        clear_btn = page.locator('button[aria-label="清除搜索"]')
        clear_btn.click()
        page.wait_for_timeout(150)
        assert name_input.input_value() == ""
        assert singer_input.input_value() == ""
        assert tag_input.input_value() == ""

        # 再输入并通过双击 Escape 清空
        name_input.click()
        name_input.type("abc")
        page.keyboard.press("Escape")
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        assert name_input.input_value() == ""

        browser.close()


def test_typing_while_songs_fetching_is_preserved():
    release_api = threading.Event()
    held_api = []

    with sync_playwright() as p:
        browser = launch_browser(p)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        def handle_songs(route):
            if route.request.method == "GET" and not release_api.is_set():
                held_api.append(route)
            else:
                route.continue_()

        page.route("**/api/songs", handle_songs)

        page.goto(BASE_URL, wait_until="load")
        name_input = page.locator('input[placeholder*="搜索歌名"]')
        name_input.wait_for(state="visible", timeout=15000)

        deadline = time.time() + 15
        while not held_api and time.time() < deadline:
            page.wait_for_timeout(50)
        assert held_api, "未捕获到 /api/songs 请求"

        name_input.click()
        name_input.type("ai")
        assert name_input.input_value() == "ai"

        release_api.set()
        for route in list(held_api):
            route.continue_()
        held_api.clear()

        page.locator("text=正在加载歌曲...").wait_for(state="hidden", timeout=30000)
        page.wait_for_timeout(400)

        after_name = name_input.input_value()
        print(f"[场景2 加载完成后] 歌名输入框={after_name!r}")
        assert after_name == "ai", (
            f"歌曲加载完成后输入内容被吞掉，期望 'ai'，实际为 {after_name!r}"
        )
        assert page.locator("span", has_text="ai").first.is_visible(), "筛选条件未生效"

        browser.close()


if __name__ == "__main__":
    failures = []
    for fn in (
        test_typing_before_hydration_is_preserved,
        test_typing_while_songs_fetching_is_preserved,
    ):
        try:
            fn()
            print(f"PASS: {fn.__name__}")
        except Exception as exc:
            print(f"FAIL: {fn.__name__}: {exc}")
            failures.append((fn.__name__, exc))
    if failures:
        sys.exit(1)
