"""Markdown Editor — local Markdown editor and vector PDF exporter. Run: python main.py."""
from __future__ import annotations

import argparse
import io
import ipaddress
import math
import os
from pathlib import Path
import socket
import threading
from urllib.parse import urlparse
import webbrowser

from flask import Flask, jsonify, request, send_file
from playwright.sync_api import Error as BrowserError, sync_playwright

ROOT = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(ROOT / "static"), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
export_lock = threading.BoundedSemaphore(2)


@app.before_request
def local_requests_only():
    if request.host.split(":")[0] not in {"127.0.0.1", "localhost", "[::1]"}:
        return jsonify(error="仅支持本机访问。"), 403
    if request.method == "POST":
        origin = request.headers.get("Origin")
        if origin and origin != request.host_url.rstrip("/"):
            return jsonify(error="请从应用页面执行导出。"), 403


@app.after_request
def response_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "font-src 'self'; img-src 'self' data: blob: http: https:; "
        "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    )
    return response


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.get("/print")
def print_page():
    return app.send_static_file("print.html")


def validate_settings(data):
    if not isinstance(data, dict):
        raise ValueError("导出参数必须是对象。")
    source = data.get("markdown")
    if not isinstance(source, str) or not source.strip():
        raise ValueError("先写一点内容，再导出 PDF。")
    if len(source.encode("utf-8")) > 16 * 1024 * 1024:
        raise ValueError("文档过大，请将文档和内嵌图片控制在 16 MB 内。")
    raw = data.get("settings", {})
    if not isinstance(raw, dict):
        raise ValueError("页面设置格式不正确。")
    settings = {}
    for key, default, low, high in [
        ("width", 210, 80, 420), ("height", 297, 100, 600),
        ("margin", 18, 5, 40), ("fontSize", 15, 12, 24),
        ("lineHeight", 1.8, 1.4, 2.2),
    ]:
        value = raw.get(key, default)
        if isinstance(value, bool):
            raise ValueError(f"{key} 参数不正确。")
        try:
            value = float(value)
        except (ValueError, TypeError):
            raise ValueError(f"{key} 参数不正确。") from None
        if not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f"{key} 必须在 {low}–{high} 之间。")
        settings[key] = value
    if settings["width"] - 2 * settings["margin"] < 40:
        raise ValueError("页边距过大：正文宽度至少需要 40 mm。")
    settings["mode"] = raw.get("mode", "paged")
    if settings["mode"] not in {"single", "paged"}:
        raise ValueError("请选择单页或分页导出。")
    settings["theme"] = raw.get("theme", "editorial")
    if settings["theme"] not in {"editorial", "academic", "minimal"}:
        raise ValueError("不支持此排版主题。")
    return source, settings


def public_image_url(url):
    """Remote images can load; private services and local files cannot."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        return False
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
        return bool(addresses) and all(ipaddress.ip_address(a[4][0]).is_global for a in addresses)
    except (OSError, ValueError):
        return False


def launch_browser(playwright):
    executable = os.environ.get("MD_RENDER_BROWSER")
    if executable:
        return playwright.chromium.launch(executable_path=executable)
    if Path(playwright.chromium.executable_path).exists():
        return playwright.chromium.launch()
    # Reuse an installed Chrome if the bundled Chromium is unavailable.
    try:
        return playwright.chromium.launch(channel="chrome")
    except BrowserError as exc:
        raise RuntimeError("未找到可用浏览器。请安装 Google Chrome，或运行 python -m playwright install chromium。") from exc


def make_pdf(source, settings, base_url):
    with sync_playwright() as pw:
        browser = launch_browser(pw)
        try:
            page = browser.new_page(viewport={"width": math.ceil(settings["width"] * 96 / 25.4), "height": 900})
            page.set_default_timeout(20000)

            def route_resource(route):
                url = route.request.url
                if url.startswith(base_url + "/static/") or url == base_url + "/print":
                    route.continue_()
                elif route.request.resource_type == "image" and (url.startswith("data:") or public_image_url(url)):
                    route.continue_()
                else:
                    route.abort()

            page.route("**/*", route_resource)
            page.goto(base_url + "/print", wait_until="load")
            page.wait_for_function("() => typeof window.renderForPrint === 'function'")
            page.emulate_media(media="print")
            measurement = page.evaluate("payload => window.renderForPrint(payload)", {"markdown": source, "settings": settings})
            if measurement["brokenImages"]:
                raise ValueError("有图片无法加载。请检查图片地址，或用工具栏的图片按钮插入本地图片后重试。")
            if measurement["overflow"]:
                raise ValueError("部分公式或表格超出正文宽度。请增大页面宽度、减小字号或为长公式分行。")
            if settings["mode"] == "single":
                height = math.ceil((measurement["height"] + 3) * 25.4 / 96 + 2 * settings["margin"])
                if height > 5080:
                    raise ValueError("文档超过单页 PDF 的 5080 mm 高度上限，请增加页面宽度或使用分页导出。")
                height = max(height, 30)
            else:
                height = settings["height"]
            return page.pdf(
                width=f'{settings["width"]}mm', height=f"{height}mm",
                margin={side: f'{settings["margin"]}mm' for side in ("top", "bottom", "left", "right")},
                print_background=True, prefer_css_page_size=False, tagged=True,
            )
        finally:
            browser.close()


@app.post("/api/export")
def export_pdf():
    if not request.is_json:
        return jsonify(error="请使用 JSON 格式提交文档。"), 415
    try:
        source, settings = validate_settings(request.get_json(silent=True))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    if not export_lock.acquire(blocking=False):
        return jsonify(error="正在处理其他导出，请稍后重试。"), 429
    try:
        pdf = make_pdf(source, settings, request.host_url.rstrip("/"))
        return send_file(io.BytesIO(pdf), mimetype="application/pdf", as_attachment=True, download_name="document.pdf")
    except ValueError as exc:
        return jsonify(error=str(exc)), 422
    except RuntimeError as exc:
        return jsonify(error=str(exc)), 503
    except BrowserError:
        app.logger.exception("PDF rendering failed")
        return jsonify(error="PDF 渲染失败或图片加载超时，请检查内容后重试。"), 500
    finally:
        export_lock.release()


@app.errorhandler(413)
def too_large(_error):
    return jsonify(error="文档和图片总大小超过 20 MB，请缩小图片后重试。"), 413


def main():
    parser = argparse.ArgumentParser(description="Markdown Editor")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not (ROOT / "static" / "app.js").exists():
        raise SystemExit("缺少前端构建文件。请先执行 npm install && npm run build。")
    url = f"http://127.0.0.1:{args.port}"
    print(f"\n  Markdown Editor  →  {url}\n  按 Ctrl+C 停止服务。\n", flush=True)
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=args.port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
