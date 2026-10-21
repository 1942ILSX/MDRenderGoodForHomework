"""Browser regression coverage for UI language, draft preservation, and PDF export."""
import argparse
import json
import sys
import unicodedata
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from main import launch_browser

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8765')
parser.add_argument('--output', default='tests/results/i18n')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = launch_browser(pw)
    context = browser.new_context(locale='en-US', viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url, wait_until='networkidle')
    assert page.locator('html').get_attribute('lang') == 'en'
    assert page.title() == 'Markdown Editor'
    assert page.locator('#paper h1').inner_text() == 'Markdown example'
    assert page.locator('#paper .katex').count() >= 3
    assert page.locator('#paper .katex-error').count() == 0
    assert page.locator('#editor').get_attribute('placeholder') == 'Write Markdown…'
    assert page.locator('#open-file').get_attribute('aria-label') == 'Open file'
    # No untranslated CJK text in the English UI (language selector is intentionally bilingual).
    assert page.evaluate('''() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.parentElement.closest('#paper, #editor, #language, script, svg')) continue;
        if (/[\\u3400-\\u9fff]/u.test(node.textContent)) return false;
      }
      return true;
    }''')
    page.screenshot(path=str(out / 'english-desktop.png'))
    sample = page.locator('#editor').input_value()
    source = sample + '\n\n# 保留原文\n\n' + '\n\n'.join(f'## Section {i}\n\n中文内容 stays unchanged. $E=mc^2$.' for i in range(12)) + '\n\nI18N-END-98765'
    page.locator('#editor').fill(source)
    page.locator('#filename').fill('My bilingual homework')
    page.locator('#open-export').click()
    page.locator('#preset').select_option('a5')
    page.locator('input[name=mode][value=single]').check()
    page.locator('[data-close=export-dialog]').first.click()
    page.locator('#language').select_option('zh-CN')
    assert page.title() == 'Markdown 编辑器'
    assert page.locator('#editor').input_value() == source
    assert page.locator('#filename').input_value() == 'My bilingual homework'
    assert '148' in page.locator('#page-summary').inner_text()
    page.wait_for_timeout(600)
    page.reload(wait_until='networkidle')
    assert page.locator('#language').input_value() == 'zh-CN'
    assert page.locator('#editor').input_value() == source
    assert page.locator('#filename').input_value() == 'My bilingual homework'
    page.locator('#language').select_option('en')
    page.locator('#open-help').click()
    assert page.locator('#help-title').inner_text() == 'Markdown syntax'
    page.locator('[data-close=help-dialog]').click()
    # Backend code, rather than response text, determines the UI language.
    page.route('**/api/export', lambda route: route.fulfill(status=429, content_type='application/json', body=json.dumps({'code': 'errorLocalBusy', 'error': '中文服务错误', 'params': {}})))
    page.locator('#open-export').click()
    page.locator('#export-submit').click()
    page.wait_for_function("() => document.querySelector('#export-error').textContent.includes('Other exports')")
    page.locator('[data-close=export-dialog]').first.click()
    page.locator('#language').select_option('zh-CN')
    assert '其他导出' in page.locator('#export-error').text_content()
    page.unroute('**/api/export')
    page.locator('#language').select_option('en')
    # Native form messages cannot follow an app language switch, so validate in the UI.
    page.locator('#open-export').click()
    page.locator('#width').fill('1')
    page.locator('#export-submit').click()
    assert page.locator('#export-error').inner_text() == 'width must be between 80 and 420.'
    page.locator('#width').fill('148')
    for index, (language, mode, width, height) in enumerate([('en', 'single', '148', '210'), ('zh-CN', 'paged', '210', '297')]):
        if index:
            page.locator('#language').select_option(language)
            page.locator('#open-export').click()
        page.locator('input[name=mode][value=' + mode + ']').check()
        page.locator('#width').fill(width)
        if mode == 'paged': page.locator('#height').fill(height)
        with page.expect_download(timeout=90000) as downloaded:
            with page.expect_response(lambda r: r.url.endswith('/api/export'), timeout=90000) as exported:
                page.locator('#export-submit').click()
            response = exported.value
            assert response.ok, f'{response.status}: {response.text()}'
        path = out / (mode + '.pdf')
        downloaded.value.save_as(path)
        assert downloaded.value.suggested_filename == 'My bilingual homework.pdf'
        pdf = PdfReader(path)
        text = unicodedata.normalize('NFKC', ''.join(p.extract_text() for p in pdf.pages))
        assert 'I18N-END-98765' in text and 'Markdown example' in text and '保留原文' in text
        assert len(pdf.pages) == 1 if mode == 'single' else len(pdf.pages) > 1
        assert abs(float(pdf.pages[0].mediabox.width) * 25.4 / 72 - int(width)) < .5
        assert page.locator('#editor').input_value() == source
        print(f'PASS: {language} UI exported {mode} PDF ({len(pdf.pages)} pages), original document and filename intact.', flush=True)
    for width in [390, 320, 768]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.locator('#language').select_option('en')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if width <= 720:
            page.locator('#mobile-preview').click()
            assert page.locator('#paper').is_visible()
        page.locator('#open-export').click()
        assert page.locator('#export-submit').is_visible()
        assert page.locator('#export-dialog').evaluate('(el) => el.scrollWidth <= el.clientWidth')
        page.screenshot(path=str(out / f'english-{width}.png'))
        page.locator('[data-close=export-dialog]').first.click()
        if width <= 720: page.locator('#mobile-editor').click()
    # Explicit example loading uses the selected language; switching alone never overwrites it.
    page.on('dialog', lambda dialog: dialog.accept())
    page.locator('#load-example').click()
    assert page.locator('#editor').input_value().startswith('# Markdown example')
    page.locator('#language').select_option('zh-CN')
    assert page.locator('#editor').input_value().startswith('# Markdown example')
    page.locator('#load-example').click()
    assert page.locator('#editor').input_value().startswith('# Markdown 示例')
    context.close()
    for language, expected in [('zh-CN', 'zh-CN'), ('fr-FR', 'en')]:
        ctx = browser.new_context(locale=language)
        tab = ctx.new_page(); tab.goto(args.url)
        tab.wait_for_function('() => document.querySelector("#editor").value.length > 0')
        assert tab.locator('html').get_attribute('lang') == expected
        ctx.close()
    # Drafts saved before language preferences existed must remain unchanged.
    ctx = browser.new_context(locale='en-US')
    old_draft = {'markdown': '# 我的作业\n\n$E=mc^2$', 'name': '作业一', 'settings': {'width': 300, 'mode': 'single'}}
    ctx.add_init_script("localStorage.setItem('moye-draft-v1', " + json.dumps(json.dumps(old_draft)) + ");")
    tab = ctx.new_page(); tab.goto(args.url)
    tab.wait_for_function('() => document.querySelector("#editor").value.length > 0')
    assert tab.locator('#editor').input_value() == old_draft['markdown']
    assert tab.locator('#filename').input_value() == old_draft['name']
    assert '300' in tab.locator('#page-summary').inner_text()
    ctx.close()
    # Storage denial must not break language switching or silently mark drafts saved.
    ctx = browser.new_context(locale='en-US')
    ctx.add_init_script("Storage.prototype.getItem = () => { throw new Error('denied'); }; Storage.prototype.setItem = () => { throw new Error('denied'); };")
    tab = ctx.new_page(); tab.goto(args.url)
    tab.wait_for_function('() => document.querySelector("#editor").value.length > 0')
    tab.locator('#language').select_option('zh-CN')
    assert tab.locator('html').get_attribute('lang') == 'zh-CN'
    assert '未保存' in tab.locator('#save-status').inner_text()
    assert not errors, errors
    ctx.close(); browser.close()
print('PASS: browser detection, persistent language preference, complete UI translation, accessibility labels, guide, server errors, validation, examples, mobile layout and storage denial.')
