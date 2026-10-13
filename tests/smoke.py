"""Real browser + PDF regression checks. Start main.py first; requires pypdf.

python tests/smoke.py --url http://127.0.0.1:8765 --output tests/results
"""
import argparse
import io
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pypdf import PdfReader
from playwright.sync_api import sync_playwright
from main import launch_browser

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:8765')
parser.add_argument('--output', default='tests/results')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as pw:
    browser = launch_browser(pw)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(args.url)
    page.wait_for_selector('.katex')
    page.evaluate('document.fonts.ready')
    example = page.locator('#editor').input_value()
    assert page.locator('#paper h1').inner_text() == 'Markdown 示例'
    assert page.locator('#paper pre code.hljs, #paper pre code').count() == 1
    assert page.locator('#paper .katex').count() >= 3
    assert page.locator('#paper .katex-error').count() == 0
    page.screenshot(path=str(out / 'desktop.png'), full_page=True)

    page.locator('#open-export').click()
    page.screenshot(path=str(out / 'export-settings.png'))
    with page.expect_download(timeout=60000) as event:
        page.locator('#export-submit').click()
    event.value.save_as(out / 'example.pdf')
    reader = PdfReader(out / 'example.pdf')
    assert len(reader.pages) >= 1
    assert abs(float(reader.pages[0].mediabox.width) * 25.4 / 72 - 210) < 0.5
    assert 'Markdown 示例' in ''.join(p.extract_text() for p in reader.pages)
    assert '导出前请检查' in ''.join(p.extract_text() for p in reader.pages)

    math_source = r'''# 公式检查

行内 $E=mc^2$，括号 \(a^2+b^2=c^2\)。

$$
\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
$$

\[
\int_0^1 x^2\,dx=\frac{1}{3}
\]

`$not_math$`

```text
$$ code is not math $$
```

<script>window.injected = true</script>
'''
    page.locator('#editor').fill(math_source)
    page.wait_for_function("() => document.querySelectorAll('#paper .katex').length === 4")
    assert page.locator('#paper .katex-error').count() == 0
    assert page.evaluate('window.injected') is None
    assert page.locator('#paper code').count() == 2
    page.wait_for_timeout(700)
    page.reload()
    assert page.locator('#editor').input_value() == math_source

    long_source = '# 长文测试\n\n' + '\n\n'.join(f'## Section {i}\n\n这是第 {i} 段中文。Text stays selectable. $E=mc^2$。' * 2 for i in range(1, 26)) + '\n\nEND-OF-DOCUMENT-98765'
    for mode, width in [('single', 148), ('paged', 148), ('single', 300)]:
        response = page.request.post(args.url + '/api/export', data={"markdown": long_source, "settings": {"mode": mode, "width": width, "height": 210}})
        assert response.ok, response.text()
        pdf = response.body()
        path = out / f'{mode}-{width}.pdf'
        path.write_bytes(pdf)
        result = PdfReader(io.BytesIO(pdf))
        assert (len(result.pages) == 1) if mode == 'single' else (len(result.pages) > 1)
        assert abs(float(result.pages[0].mediabox.width) * 25.4 / 72 - width) < 0.5
        assert 'END-OF-DOCUMENT-98765' in ''.join(p.extract_text() for p in result.pages)
        print(f'{mode}, {width} mm: {len(result.pages)} pages, height {float(result.pages[0].mediabox.height) * 25.4 / 72:.1f} mm, last paragraph intact')

    # A self-contained image must survive export with no remote connection.
    image_md = '# Image\n\n![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=)\n\nIMAGE-END'
    response = page.request.post(args.url + '/api/export', data={"markdown": image_md, "settings": {"mode": "single"}})
    assert response.ok, response.text()
    assert len(PdfReader(io.BytesIO(response.body())).pages[0].images) == 1

    # Long screenshots must not change size during printing and spill onto a second page.
    tall_image = page.evaluate("""() => {
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 3200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#6b8058'; ctx.fillRect(0, 0, 800, 3200);
        return canvas.toDataURL('image/png');
    }""")
    for mode in ['single', 'paged']:
        response = page.request.post(args.url + '/api/export', data={"markdown": f'# 长图片\n\n![tall]({tall_image})\n\nTALL-IMAGE-END', "settings": {"mode": mode}})
        assert response.ok, response.text()
        image_pdf = PdfReader(io.BytesIO(response.body()))
        if mode == 'single':
            assert len(image_pdf.pages) == 1
        assert 'TALL-IMAGE-END' in ''.join(p.extract_text() for p in image_pdf.pages)

    response = page.request.post(args.url + '/api/export', data={"markdown": '![missing](http://127.0.0.1:9/private.png)'})
    assert response.status == 422, response.text()

    page.locator('#editor').fill(example)
    page.wait_for_timeout(700)
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.locator('#editor').is_visible()
    page.locator('#mobile-preview').click()
    assert page.locator('#paper').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out / 'mobile.png'))
    page.locator('#mobile-editor').click()
    page.locator('#editor').fill('')
    page.wait_for_timeout(200)
    page.locator('#open-export').click()
    page.locator('#export-submit').click()
    assert page.locator('#export-error').is_visible()
    assert not errors, errors
    browser.close()
print('PASS: preview, math delimiters, code, XSS escaping, persistence, download, page modes, widths, selectable Chinese text, image, errors, mobile.')
