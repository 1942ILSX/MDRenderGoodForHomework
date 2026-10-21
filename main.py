"""Markdown Editor — local Markdown editor and vector PDF exporter. Run: python main.py."""
from __future__ import annotations

import argparse
import io
import ipaddress
import json
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
MESSAGES = {locale: json.loads((ROOT / "locales" / f"{locale}.json").read_text(encoding="utf-8"))
            for locale in ("zh-CN", "en")}


class ApplicationError(ValueError):
    def __init__(self, code, params=None, status=400):
        self.code, self.params, self.status = code, params or {}, status
        super().__init__(MESSAGES["zh-CN"][code].format(**self.params))


def error_response(code, status, params=None):
    locale = "zh-CN"
    for language, quality in request.accept_languages:
        base = language.lower().split("-")[0]
        if quality > 0 and base in {"zh", "en"}:
            locale = "zh-CN" if base == "zh" else "en"
            break
    params = params or {}
    response = jsonify(error=MESSAGES[locale][code].format(**params), code=code, params=params)
    response.headers["Content-Language"] = locale
    return response, status


@app.before_request
def local_requests_only():
    if request.host.split(":")[0] not in {"127.0.0.1", "localhost", "[::1]"}:
        return error_response("errorLocalOnly", 403)
    if request.method == "POST":
        origin = request.headers.get("Origin")
        if origin and origin != request.host_url.rstrip("/"):
            return error_response("errorOrigin", 403)


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
        raise ApplicationError("errorPayload")
    source = data.get("markdown")
    if not isinstance(source, str) or not source.strip():
        raise ApplicationError("errorEmpty")
    if len(source.encode("utf-8")) > 16 * 1024 * 1024:
        raise ApplicationError("errorDocumentSize")
    raw = data.get("settings", {})
    if not isinstance(raw, dict):
        raise ApplicationError("errorSettings")
    settings = {}
    for key, default, low, high in [
        ("width", 210, 80, 420), ("height", 297, 100, 600),
        ("margin", 18, 5, 40), ("fontSize", 15, 12, 24),
        ("lineHeight", 1.8, 1.4, 2.2),
    ]:
        value = raw.get(key, default)
        if isinstance(value, bool):
            raise ApplicationError("errorNumber", {"key": key})
        try:
            value = float(value)
        except (ValueError, TypeError):
            raise ApplicationError("errorNumber", {"key": key}) from None
        if not math.isfinite(value) or not low <= value <= high:
            raise ApplicationError("errorRange", {"key": key, "low": low, "high": high})
        settings[key] = value
    if settings["width"] - 2 * settings["margin"] < 40:
        raise ApplicationError("errorMargin")
    settings["mode"] = raw.get("mode", "paged")
    if settings["mode"] not in {"single", "paged"}:
        raise ApplicationError("errorMode")
    settings["theme"] = raw.get("theme", "editorial")
    if settings["theme"] not in {"editorial", "academic", "minimal"}:
        raise ApplicationError("errorTheme")
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
        raise ApplicationError("errorBrowser", status=503) from exc


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
                raise ApplicationError("errorImages", status=422)
            if measurement["overflow"]:
                raise ApplicationError("errorOverflow", status=422)
            if settings["mode"] == "single":
                height = math.ceil((measurement["height"] + 3) * 25.4 / 96 + 2 * settings["margin"])
                if height > 5080:
                    raise ApplicationError("errorHeight", status=422)
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
        return error_response("errorJsonType", 415)
    try:
        source, settings = validate_settings(request.get_json(silent=True))
    except ApplicationError as exc:
        return error_response(exc.code, exc.status, exc.params)
    if not export_lock.acquire(blocking=False):
        return error_response("errorLocalBusy", 429)
    try:
        pdf = make_pdf(source, settings, request.host_url.rstrip("/"))
        return send_file(io.BytesIO(pdf), mimetype="application/pdf", as_attachment=True, download_name="document.pdf")
    except ApplicationError as exc:
        return error_response(exc.code, exc.status, exc.params)
    except RuntimeError:
        return error_response("errorExport", 503)
    except BrowserError:
        app.logger.exception("PDF rendering failed")
        return error_response("errorExport", 500)
    finally:
        export_lock.release()


@app.errorhandler(413)
def too_large(_error):
    return error_response("errorBodySize", 413)


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
