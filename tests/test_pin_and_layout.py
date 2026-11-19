import glob
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import time
import urllib.request
from playwright.sync_api import sync_playwright

REDIS_PORT = 3101
NEXT_PORT = 3100
BASE_URL = f"http://127.0.0.1:{NEXT_PORT}"
SCREENSHOT_DIR = os.path.join(os.getcwd(), ".codex-work")


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


def create_initial_song_map():
    return {
        "song-1": {
            "id": "song-1",
            "name": "晴天",
            "singers": ["周杰伦"],
            "tags": ["流行", "怀旧"],
            "key": 0,
            "notes": "经典前奏",
            "featured": True,
            "pinned": False,
            "ensembleType": "none",
            "createdAt": "2026-01-01T00:00:00.000Z",
        },
        "song-2": {
            "id": "song-2",
            "name": "七里香",
            "singers": ["周杰伦"],
            "tags": ["流行"],
            "key": 2,
            "featured": False,
            "pinned": False,
            "ensembleType": "duet",
            "createdAt": "2026-01-02T00:00:00.000Z",
        },
        "song-3": {
            "id": "song-3",
            "name": "富士山下",
            "singers": ["陈奕迅"],
            "tags": ["粤语", "抒情"],
            "key": -1,
            "featured": False,
            "pinned": False,
            "ensembleType": "none",
            "createdAt": "2026-01-03T00:00:00.000Z",
        },
        "song-4": {
            "id": "song-4",
            "name": "告白气球",
            "singers": ["周杰伦"],
            "tags": ["甜歌"],
            "key": None,
            "featured": True,
            "pinned": False,
            "ensembleType": "chorus",
            "createdAt": "2026-01-04T00:00:00.000Z",
        },
    }


def start_local_upstash_server(store):
    class UpstashHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            return

        def exec_one(self, cmd):
            op = str(cmd[0]).upper()
            if op == "GET":
                key = cmd[1]
                val = store.get(key)
                return {"result": json.dumps(val, ensure_ascii=False) if val is not None else None}
            if op == "SET":
                key = cmd[1]
                val = cmd[2]
                if isinstance(val, str):
                    try:
                        store[key] = json.loads(val)
                    except json.JSONDecodeError:
                        store[key] = val
                else:
                    store[key] = val
                return {"result": "OK"}
            return {"result": None}

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            body = json.loads(raw)
            if isinstance(body, list) and body and isinstance(body[0], list):
                response_data = [self.exec_one(item) for item in body]
            else:
                response_data = self.exec_one(body)

            payload = json.dumps(response_data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True

    server = ReusableTCPServer(("127.0.0.1", REDIS_PORT), UpstashHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def wait_for_server(url, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.3)
    raise RuntimeError(f"服务启动超时: {url}")


def run_tests():
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    store = {"songlist": create_initial_song_map()}
    redis_server = start_local_upstash_server(store)

    env = os.environ.copy()
    env["UPSTASH_REDIS_REST_URL"] = f"http://127.0.0.1:{REDIS_PORT}"
    env["UPSTASH_REDIS_REST_TOKEN"] = "local-test-token"
    env["SONGLIST_PASSWORD"] = "testpass"
    env["NEXT_PUBLIC_SONGLIST_PASSWORD"] = "testpass"

    next_proc = subprocess.Popen(
        ["./node_modules/.bin/next", "dev", "-p", str(NEXT_PORT), "-H", "127.0.0.1"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        wait_for_server(f"{BASE_URL}/api/songs", timeout=40)

        with sync_playwright() as p:
            browser = launch_browser(p)

            # 1. 电脑端布局 + 只读模式检查
            desktop = browser.new_context(viewport={"width": 1280, "height": 860})
            page = desktop.new_page()
            page.goto(BASE_URL, wait_until="load")
            page.locator("text=正在加载歌曲...").wait_for(state="hidden", timeout=20000)

            search_panel_box = page.locator(".search-panel").bounding_box()
            song_grid_box = page.locator(".song-grid").bounding_box()
            right_panel_box = page.locator(".right-panel").bounding_box()
            assert search_panel_box and song_grid_box and right_panel_box
            width_diff = abs(search_panel_box["width"] - song_grid_box["width"])
            left_diff = abs(search_panel_box["x"] - song_grid_box["x"])
            top_diff = abs(search_panel_box["y"] - right_panel_box["y"])
            print(
                f"[电脑端对齐] search-panel={search_panel_box}, song-grid={song_grid_box}, right-panel={right_panel_box}, width_diff={width_diff:.2f}, top_diff={top_diff:.2f}"
            )
            assert width_diff <= 1.5, f"搜索栏总宽度与三列卡片总宽度未对齐: diff={width_diff}"
            assert left_diff <= 1.5, f"搜索栏左边缘与三列卡片左边缘未对齐: diff={left_diff}"
            assert top_diff <= 1.5, f"右侧详情区顶部未与搜索栏顶部对齐: diff={top_diff}"

            # 校验电脑端两行布局、第二行左对齐与从左到右顺序：featured -> pinned -> ensemble -> 耳机
            name_box = page.locator('input[placeholder*="搜索歌名"]').bounding_box()
            featured_btn = page.locator(".search-filters-row button", has_text="featured")
            pinned_btn = page.locator(".search-filters-row button", has_text="pinned")
            ensemble_group = page.locator(".search-filters-row > div").first
            audio_btn = page.locator('.search-filters-row button[title="只显示带音频的歌曲"]')

            f_box = featured_btn.bounding_box()
            p_box = pinned_btn.bounding_box()
            e_box = ensemble_group.bounding_box()
            a_box = audio_btn.bounding_box()

            assert f_box["y"] > name_box["y"] + name_box["height"] - 2, "筛选按钮不在第二行"
            assert abs(f_box["y"] - p_box["y"]) < 8, "featured 与 pinned 不在同一行"
            assert abs(f_box["x"] - name_box["x"]) <= 2.0, "第二行未向左对齐"
            assert f_box["x"] < p_box["x"] < e_box["x"] < a_box["x"], (
                f"第二行顺序错误: featured={f_box['x']}, pinned={p_box['x']}, ensemble={e_box['x']}, audio={a_box['x']}"
            )
            gap_pin_to_ensemble = e_box["x"] - (p_box["x"] + p_box["width"])
            assert 0 <= gap_pin_to_ensemble <= 16, (
                f"第二行合唱筛选组未紧跟 pinned 左对齐，间距={gap_pin_to_ensemble}"
            )
            print("[电脑端第二行左对齐与顺序] PASS")

            # 只读模式下点击歌曲查看详情卡片，不应出现可点击的 pin 按钮
            page.locator(".song-column > div", has_text="晴天").click()
            assert page.locator('[data-testid="detail-pin-button"]').count() == 0, (
                "只读模式不应显示 pin 按钮"
            )

            # 2. 登录编辑权限
            page.locator("button", has_text="编辑模式").click()
            page.locator('input[type="password"]').fill("testpass")
            page.locator("button", has_text="进入").click()
            page.locator("text=已解锁").wait_for(state="visible", timeout=5000)

            # 详情展示卡片上应直接显示 pin 按钮
            detail_pin = page.locator('[data-testid="detail-pin-button"]')
            detail_pin.wait_for(state="visible", timeout=5000)
            assert detail_pin.get_attribute("aria-label") == "置顶"

            # 点击一次 pin
            detail_pin.click()
            page.wait_for_function(
                "() => document.querySelector('[data-testid=\"detail-pin-button\"]')?.getAttribute('aria-label') === '取消置顶'",
                timeout=10000,
            )

            # 验证「晴天」已排到列表第一位（第一列第一张卡片）
            first_card = page.locator(".song-column").first.locator("> div").first
            assert "晴天" in first_card.inner_text(), f"已 pin 歌曲未置顶: {first_card.inner_text()}"

            # 验证卡片左上角有图钉，且一半在卡片外一半在卡片内
            card_box = first_card.bounding_box()
            pin_badge = first_card.locator('[data-testid="pinned-corner-pin"]')
            pin_badge.wait_for(state="visible", timeout=5000)
            pin_box = pin_badge.bounding_box()
            print(f"[左上角图钉位置] card={card_box}, pin={pin_box}")
            assert pin_box["x"] < card_box["x"] < pin_box["x"] + pin_box["width"], (
                "图钉水平位置不是一半在卡片外一半在卡片内"
            )
            assert pin_box["y"] < card_box["y"] < pin_box["y"] + pin_box["height"], (
                "图钉垂直位置不是一半在卡片外一半在卡片内"
            )

            # 截图查看电脑端已 pin 状态
            page.wait_for_timeout(250)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "desktop-pinned-detail.png"))

            # 测试搜索栏 pinned 筛选按钮
            pinned_btn.click()
            page.wait_for_timeout(200)
            visible_cards = page.locator(".song-column > div")
            assert visible_cards.count() == 1, f"pinned 筛选应只剩 1 首，实际 {visible_cards.count()}"
            assert "晴天" in visible_cards.first.inner_text()
            pinned_btn.click()
            page.wait_for_timeout(200)
            assert page.locator(".song-column > div").count() == 4

            # 刷新页面确认 pin 状态已持久化
            page.reload(wait_until="load")
            page.locator("text=正在加载歌曲...").wait_for(state="hidden", timeout=20000)
            first_card_after_reload = page.locator(".song-column").first.locator("> div").first
            assert "晴天" in first_card_after_reload.inner_text()
            assert first_card_after_reload.locator('[data-testid="pinned-corner-pin"]').is_visible()

            # 点进编辑界面确认也有 pin/unpin 按钮，并且可以切换并保存
            first_card_after_reload.click()
            page.locator("button", has_text="编辑 ✏️").click()
            edit_pin = page.locator('[data-testid="edit-pin-button"]')
            edit_pin.wait_for(state="visible", timeout=5000)
            assert "unpin" in edit_pin.inner_text()

            # 校验编辑页「信息」行左右各占 50%，右侧按钮均分右半区，音频拖拽区保持一行
            edit_ensemble_group = page.locator('[data-testid="edit-ensemble-group"]')
            edit_flags_group = page.locator('[data-testid="edit-flags-group"]')
            edit_featured = page.locator('[data-testid="edit-featured-button"]')
            eg_box = edit_ensemble_group.bounding_box()
            fg_box = edit_flags_group.bounding_box()
            ef_box = edit_featured.bounding_box()
            ep_box = edit_pin.bounding_box()
            assert abs(eg_box["width"] - fg_box["width"]) <= 1.5, f"信息行左右未各占一半: {eg_box} vs {fg_box}"
            assert abs(ef_box["width"] - ep_box["width"]) <= 1.5, f"右侧按钮未均分右半区: {ef_box} vs {ep_box}"
            assert abs(ef_box["y"] - ep_box["y"]) < 4, f"featured 与 pin 未在同一行: {ef_box} vs {ep_box}"
            assert eg_box["x"] < ef_box["x"] < ep_box["x"], "信息行顺序异常"

            audio_t1 = page.locator("form span", has_text="点击选择或拖拽 MP3 到此处").bounding_box()
            audio_t2 = page.locator("form span", has_text="仅支持 MP3").bounding_box()
            assert abs(audio_t1["y"] - audio_t2["y"]) < 6, f"音频拖拽区未保持一行: {audio_t1} vs {audio_t2}"

            page.screenshot(
                path=os.path.join(SCREENSHOT_DIR, "desktop-edit-mode.png"),
                full_page=True,
            )

            # 在编辑界面点一下 unpin 并保存
            edit_pin.click()
            assert "pin" in edit_pin.inner_text() and "unpin" not in edit_pin.inner_text()
            page.locator('button[type="submit"]', has_text="保存").click()
            page.locator('[data-testid="detail-pin-button"]').wait_for(state="visible", timeout=10000)
            assert (
                page.locator('[data-testid="detail-pin-button"]').get_attribute("aria-label")
                == "置顶"
            )
            assert page.locator(".song-column [data-testid='pinned-corner-pin']").count() == 0

            # 在详情展示卡片再点一下 pin、再点一下 unpin
            page.locator('[data-testid="detail-pin-button"]').click()
            page.wait_for_function(
                "() => document.querySelector('[data-testid=\"detail-pin-button\"]')?.getAttribute('aria-label') === '取消置顶'",
                timeout=10000,
            )
            assert page.locator(".song-column [data-testid='pinned-corner-pin']").count() == 1

            page.locator('[data-testid="detail-pin-button"]').click()
            page.wait_for_function(
                "() => document.querySelector('[data-testid=\"detail-pin-button\"]')?.getAttribute('aria-label') === '置顶'",
                timeout=10000,
            )
            assert page.locator(".song-column [data-testid='pinned-corner-pin']").count() == 0
            desktop.close()

            # 3. 手机端布局检查
            mobile = browser.new_context(viewport={"width": 390, "height": 844})
            m_page = mobile.new_page()
            m_page.goto(BASE_URL, wait_until="load")
            m_page.locator("text=正在加载歌曲...").wait_for(state="hidden", timeout=20000)

            m_search = m_page.locator(".search-panel").bounding_box()
            m_main = m_page.locator("main").bounding_box()
            m_left = m_page.locator(".left-panel").bounding_box()
            m_right = m_page.locator(".right-panel").bounding_box()
            print(f"[手机端布局] search={m_search}, left={m_left}, right={m_right}")
            # 手机端 search-panel 占满 main 内容宽度（390 - 32 = 358）
            assert abs(m_search["width"] - (m_main["width"] - 32)) <= 2.0, (
                f"手机端搜索栏未保持满宽: {m_search['width']} vs {m_main['width'] - 32}"
            )
            assert abs(m_left["width"] - m_right["width"]) <= 2.0, "手机端左右栏应保持 50%/50%"
            m_page.screenshot(path=os.path.join(SCREENSHOT_DIR, "mobile-layout.png"))
            mobile.close()

            browser.close()
            print("ALL PIN & LAYOUT TESTS PASSED")
    finally:
        next_proc.terminate()
        try:
            next_proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            next_proc.kill()
        redis_server.shutdown()
        redis_server.server_close()


if __name__ == "__main__":
    run_tests()
