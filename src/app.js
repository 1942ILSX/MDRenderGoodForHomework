import { renderMarkdown, applyDocumentStyle } from './renderer.js';

const LEGACY_EXAMPLE = String.raw`# 让想法，自然成页。

每一个值得记录的想法，都值得一份清晰的表达。
在左侧写下 Markdown，在右侧看见它的模样。

> 写作，是把思考的过程留在纸上。

## 01 / 从文字开始

用 **粗体** 标记重点，用 *斜体* 留下一点语气。
无论是学习笔记、技术文档，还是一份认真准备的报告，
墨页都可以陪你从第一行写到最后一页。

- 实时预览，让排版与思考同步
- 自定义页宽，让长文找到合适的尺度
- 一页长文或多页文档，按需导出 PDF

## 02 / 让公式也优雅

爱因斯坦用一个简洁的公式，连接了质量与能量：$E = mc^2$。
而一条高斯曲线，描绘了随机世界里的秩序：

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}}
       e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

也支持矩阵、积分和多行推导：

$$
\begin{aligned}
\int_0^1 x^2\,dx
&= \left[\frac{x^3}{3}\right]_0^1 \\
&= \frac{1}{3}
\end{aligned}
$$

## 03 / 有条理，也有细节

| 内容 | 写法 | 呈现 |
| :--- | :--- | :--- |
| 行内公式 | \`$E = mc^2$\` | 与文字自然衔接 |
| 独立公式 | \`$$ ... $$\` | 居中展示，清晰易读 |
| 代码片段 | 三个反引号 + 语言 | 保留缩进，自动高亮 |

\`\`\`python
from math import sqrt, pi, exp

def gaussian(x, mu=0, sigma=1):
    """在复杂的世界里，发现简单的规律。"""
    return exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * sqrt(2 * pi))
\`\`\`

### 一份小小的写作清单

- [x] 记录一个想法
- [x] 为它找到清晰的表达
- [ ] 点击右上角，将它保存为 PDF

---

*留一点空白，给下一个想法。*
`.replaceAll('\\`', '`');

export const EXAMPLE = String.raw`# Markdown 示例

在左侧编辑源码，右侧查看排版结果。

## 基本文本

支持 **粗体**、*斜体*、~~删除线~~、列表和引用。

> 引用内容使用大于号开头。

- 打开或拖入 Markdown 文件
- 使用工具栏插入图片、表格和公式
- 保存源码，或导出 PDF

## 数学公式

行内公式：$E = mc^2$。

独立公式：

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}}
       e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

多行推导：

$$
\begin{aligned}
\int_0^1 x^2\,dx
&= \left[\frac{x^3}{3}\right]_0^1 \\
&= \frac{1}{3}
\end{aligned}
$$

## 表格与代码

| 功能 | 语法 | 说明 |
| :--- | :--- | :--- |
| 行内公式 | \`$...$\` | 与正文同行 |
| 独立公式 | \`$$...$$\` | 单独居中 |
| 代码块 | 三个反引号 + 语言 | 自动高亮 |

\`\`\`python
from math import sqrt, pi, exp

def gaussian(x, mu=0, sigma=1):
    return exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * sqrt(2 * pi))
\`\`\`

## 导出设置

- [x] 选择页面宽度、边距和字号
- [x] 单页模式按内容计算高度
- [ ] 分页模式按指定页高自动分页

导出前请检查预览中的公式、图片和表格。
`.replaceAll('\\`', '`');

const $ = id => document.getElementById(id);
const editor = $('editor');
const paper = $('paper');
const preview = $('preview-scroll');
const defaults = { mode: 'paged', width: 210, height: 297, margin: 18, fontSize: 15, lineHeight: 1.8, theme: 'editorial' };
const presets = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4] };
const STORAGE_KEY = 'moye-draft-v1';
let settings = { ...defaults };
let renderTimer, saveTimer, toastTimer, fit = true, draftSaved = true;
let source = EXAMPLE, name = '示例文档';
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved.markdown === 'string') {
    source = saved.markdown === LEGACY_EXAMPLE ? EXAMPLE : saved.markdown;
    name = typeof saved.name === 'string' ? saved.name : name;
    if (saved.markdown === LEGACY_EXAMPLE && name === '我的第一份文档') name = '示例文档';
    for (const key of Object.keys(defaults)) {
      if (typeof saved.settings?.[key] === typeof defaults[key]) settings[key] = saved.settings[key];
    }
    // Ignore stale or malformed saved values rather than producing an invalid page.
    const ranges = { width: [80, 420], height: [100, 600], margin: [5, 40], fontSize: [12, 24], lineHeight: [1.4, 2.2] };
    for (const [key, [low, high]] of Object.entries(ranges)) if (!Number.isFinite(settings[key]) || settings[key] < low || settings[key] > high) settings[key] = defaults[key];
    if (settings.width - 2 * settings.margin < 40) settings.margin = 10;
    if (!['paged', 'single'].includes(settings.mode)) settings.mode = 'paged';
    if (!['editorial', 'academic', 'minimal'].includes(settings.theme)) settings.theme = 'editorial';
  }
} catch { /* A fresh draft works even when storage is unavailable. */ }
editor.value = source;
$('filename').value = name;

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
}

function saveDraft() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ markdown: editor.value, name: $('filename').value, settings }));
    $('save-status').textContent = '草稿已保存在本机';
    draftSaved = true;
  } catch {
    $('save-status').textContent = '草稿未保存，请保存 MD 文件';
    draftSaved = false;
  }
}

function scheduleSave() {
  draftSaved = false;
  $('save-status').textContent = '正在保存…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
}

function updateCursor() {
  const before = editor.value.slice(0, editor.selectionStart).split('\n');
  $('cursor-position').textContent = `行 ${before.length}，列 ${before.at(-1).length + 1}`;
}

function fitPaper() {
  const width = settings.width * 96 / 25.4;
  const padding = parseFloat(getComputedStyle(preview).paddingLeft) + parseFloat(getComputedStyle(preview).paddingRight);
  const available = preview.clientWidth - padding;
  if (available < 10) return;
  const scale = fit ? Math.min(1, available / width) : 1;
  paper.style.width = `${width}px`;
  paper.style.padding = `${settings.margin}mm`;
  paper.style.minHeight = settings.mode === 'paged' ? `${settings.height}mm` : '100px';
  paper.style.transform = `scale(${scale})`;
  $('paper-frame').style.width = `${width * scale}px`;
  $('paper-frame').style.height = `${paper.offsetHeight * scale}px`;
  $('zoom-value').textContent = `${Math.round(scale * 100)}%`;
}

function render() {
  try {
    paper.innerHTML = renderMarkdown(editor.value);
    applyDocumentStyle(paper, settings);
    const empty = !editor.value.trim();
    $('paper-frame').hidden = empty;
    $('empty-preview').hidden = !empty;
    const count = Array.from(editor.value.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '[图片]').replace(/\s/g, '')).length;
    $('word-count').textContent = `${count.toLocaleString()} 字符 · ${editor.value.split('\n').length} 行`;
    $('line-numbers').textContent = Array.from({ length: editor.value.split('\n').length }, (_, i) => i + 1).join('\n');
    $('line-numbers').style.whiteSpace = 'pre';
    $('math-warning').hidden = !paper.querySelector('.katex-error');
    for (const image of paper.querySelectorAll('img')) image.addEventListener('load', fitPaper, { once: true });
    fitPaper();
    document.fonts.ready.then(fitPaper);
    updateCursor();
  } catch (error) {
    toast(`预览失败：${error.message}`);
  }
}

function updateSettingsUI() {
  for (const key of ['width', 'height', 'margin', 'fontSize', 'lineHeight', 'theme']) $(key).value = settings[key];
  document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;
  const selected = Object.entries(presets).find(([, size]) => size[0] === settings.width && size[1] === settings.height);
  $('preset').value = selected?.[0] || 'custom';
  const single = settings.mode === 'single';
  $('height-field').hidden = single;
  $('height').disabled = single;
  $('auto-height-field').hidden = !single;
  $('line-height-value').value = settings.lineHeight.toFixed(1);
  const title = selected ? { a4: 'A4', a5: 'A5', letter: 'Letter' }[selected[0]] : '自定义';
  $('page-summary').textContent = single ? `单页长文 · ${settings.width} mm` : `${title} · ${settings.width} × ${settings.height} mm`;
  applyDocumentStyle(paper, settings);
  fitPaper();
}

function openExport() {
  updateSettingsUI();
  $('export-error').hidden = true;
  $('export-dialog').showModal();
}

function setError(message) {
  $('export-error').textContent = message;
  $('export-error').hidden = false;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function filename(extension) {
  return ($('filename').value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.(md|markdown|pdf)$/i, '') || '未命名文档') + extension;
}

function saveMarkdown() {
  download(new Blob([editor.value], { type: 'text/markdown;charset=utf-8' }), filename('.md'));
  saveDraft();
  toast('Markdown 文件已保存');
}

function replaceSelection(text, selectionOffset = null, selectionLength = 0) {
  editor.focus();
  const start = editor.selectionStart;
  // insertText preserves the textarea's native undo stack.
  const inserted = document.execCommand('insertText', false, text);
  if (!inserted) {
    editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (selectionOffset !== null) editor.setSelectionRange(start + selectionOffset, start + selectionOffset + selectionLength);
  updateCursor();
}

function format(kind) {
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const pairs = { bold: ['**', '**', '重点文字'], italic: ['*', '*', '倾斜文字'], heading: ['\n## ', '\n', '新的标题'], quote: ['\n> ', '\n', '一段值得引用的话'], link: ['[', '](https://example.com)', '链接文字'], code: ['\n```python\n', '\n```\n', 'print("Hello, world!")'], math: ['\n$$\n', '\n$$\n', 'E = mc^2'] };
  if (kind === 'table') return replaceSelection('\n| 标题一 | 标题二 |\n| --- | --- |\n| 内容 | 内容 |\n');
  const [left, right, placeholder] = pairs[kind];
  const inner = selected || placeholder;
  replaceSelection(left + inner + right, left.length, inner.length);
}

async function importMarkdown(file) {
  if (!file) return;
  if (!/\.(md|markdown|txt)$/i.test(file.name)) return toast('请选择 .md、.markdown 或 .txt 文件');
  if (file.size > 16 * 1024 * 1024) return toast('文件超过 16 MB，请缩小文档后重试');
  try {
    const text = await file.text();
    editor.value = text.replace(/^\uFEFF/, '');
    $('filename').value = file.name.replace(/\.(md|markdown|txt)$/i, '');
    editor.scrollTop = 0;
    preview.scrollTop = 0;
    $('line-numbers').style.transform = '';
    render();
    saveDraft();
    toast(`已打开 ${file.name}`);
  } catch { toast('文件读取失败，请重试'); }
}

async function insertImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) return toast('支持 PNG、JPEG、GIF、WebP 图片');
  if (file.size > 5 * 1024 * 1024) return toast('单张图片请控制在 5 MB 内');
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    if (new Blob([editor.value, data]).size > 16 * 1024 * 1024) return toast('文档和内嵌图片总大小不能超过 16 MB');
    replaceSelection(`\n![${file.name.replace(/[\[\]\\]/g, '') || '图片'}](${data})\n`);
    toast('图片已内嵌，导出时会一起保留');
  } catch { toast('图片读取失败'); }
}

editor.addEventListener('input', () => { clearTimeout(renderTimer); renderTimer = setTimeout(render, 100); scheduleSave(); updateCursor(); });
editor.addEventListener('scroll', () => {
  $('line-numbers').style.transform = `translateY(${-editor.scrollTop}px)`;
  if ($('sync-scroll').checked) {
    const range = editor.scrollHeight - editor.clientHeight;
    preview.scrollTop = range > 0 ? editor.scrollTop / range * (preview.scrollHeight - preview.clientHeight) : 0;
  }
});
for (const event of ['click', 'keyup', 'select']) editor.addEventListener(event, updateCursor);
editor.addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); replaceSelection('  '); } });
editor.addEventListener('paste', event => {
  const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
  if (image) { event.preventDefault(); insertImage(image.getAsFile()); }
});
$('filename').addEventListener('input', scheduleSave);
$('open-file').onclick = () => $('file-input').click();
$('file-input').onchange = event => { importMarkdown(event.target.files[0]); event.target.value = ''; };
$('save-md').onclick = saveMarkdown;
$('insert-image').onclick = () => $('image-input').click();
$('image-input').onchange = event => { insertImage(event.target.files[0]); event.target.value = ''; };
$('open-export').onclick = $('page-settings').onclick = openExport;
$('open-help').onclick = () => $('help-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
document.querySelectorAll('[data-format]').forEach(button => button.onclick = () => format(button.dataset.format));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
}));
$('new-document').onclick = () => {
  if (editor.value.trim() && !confirm('新建将替换当前草稿。请确认已保存需要保留的 Markdown 文件。')) return;
  editor.value = ''; $('filename').value = '未命名文档'; render(); saveDraft(); editor.focus();
};
$('load-example').onclick = () => {
  if (editor.value !== EXAMPLE && editor.value.trim() && !confirm('载入示例将替换当前草稿。请确认已保存需要保留的 Markdown 文件。')) return;
  editor.value = EXAMPLE; $('filename').value = '示例文档'; render(); saveDraft();
};
$('zoom').onclick = () => { fit = !fit; fitPaper(); };
$('mobile-preview').onclick = () => { $('workspace').classList.add('show-preview'); fitPaper(); };
$('mobile-editor').onclick = () => $('workspace').classList.remove('show-preview');
$('theme').onchange = event => { settings.theme = event.target.value; updateSettingsUI(); scheduleSave(); };
$('preset').onchange = event => {
  const size = presets[event.target.value];
  if (size) { [settings.width, settings.height] = size; updateSettingsUI(); scheduleSave(); }
};
document.querySelectorAll('input[name="mode"]').forEach(input => input.onchange = event => { settings.mode = event.target.value; updateSettingsUI(); scheduleSave(); });
for (const key of ['width', 'height', 'margin', 'fontSize', 'lineHeight']) {
  $(key).addEventListener('input', event => {
    if (!event.target.checkValidity()) return;
    settings[key] = event.target.valueAsNumber;
    // Keep the input caret intact while reflecting live sizing elsewhere.
    const selected = Object.entries(presets).find(([, size]) => size[0] === settings.width && size[1] === settings.height);
    $('preset').value = selected?.[0] || 'custom';
    $('line-height-value').value = settings.lineHeight.toFixed(1);
    applyDocumentStyle(paper, settings);
    fitPaper();
    scheduleSave();
  });
}
$('export-dialog').addEventListener('close', updateSettingsUI);
$('export-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!editor.value.trim()) return setError('先写一点内容，再导出 PDF。');
  if (settings.width - 2 * settings.margin < 40) return setError('页边距过大：正文宽度至少需要 40 mm。');
  $('export-error').hidden = true;
  const submit = $('export-submit');
  submit.disabled = true;
  submit.querySelector('span').textContent = '正在排版…';
  const exportName = filename('.pdf');
  try {
    const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: editor.value, settings }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `导出失败（${response.status}）`);
    }
    download(await response.blob(), exportName);
    $('export-dialog').close();
    toast('PDF 已导出');
  } catch (error) {
    setError(error.name === 'TimeoutError' ? '导出超时，请检查图片地址或缩短文档后重试。' : error.message === 'Failed to fetch' ? '无法连接 PDF 导出服务，请稍后重试。' : error.message);
  } finally {
    submit.disabled = false;
    submit.querySelector('span').textContent = '导出 PDF';
  }
});
let dragDepth = 0;
const dropZone = $('drop-zone');
dropZone.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragover', event => event.preventDefault());
dropZone.addEventListener('dragleave', () => { if (--dragDepth <= 0) dropZone.classList.remove('dragging'); });
dropZone.addEventListener('drop', event => {
  event.preventDefault(); dragDepth = 0; dropZone.classList.remove('dragging');
  const file = event.dataTransfer.files[0];
  if (file?.type.startsWith('image/')) insertImage(file); else importMarkdown(file);
});
document.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey) {
    if (event.key.toLowerCase() === 's') { event.preventDefault(); saveMarkdown(); }
    if (event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); if (!$('export-dialog').open) openExport(); }
    if (event.key.toLowerCase() === 'b' && document.activeElement === editor) { event.preventDefault(); format('bold'); }
  }
  if (event.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('help-dialog').open) $('help-dialog').showModal();
});
window.addEventListener('beforeunload', event => {
  if (!draftSaved) saveDraft();
  if (!draftSaved) { event.preventDefault(); event.returnValue = ''; }
});
new ResizeObserver(fitPaper).observe(preview);
new ResizeObserver(fitPaper).observe(paper);
updateSettingsUI();
render();
saveDraft();
