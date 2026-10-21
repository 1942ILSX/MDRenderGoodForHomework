import { renderMarkdown, applyDocumentStyle } from './renderer.js';

import { LEGACY_EXAMPLE, exampleFor } from './examples.js';
import { LANGUAGE_KEY, catalogs, resolveLocale, translate, translatePage } from './i18n.js';

let locale = resolveLocale(navigator.languages || [navigator.language]);
try {
  const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
  if (Object.hasOwn(catalogs, savedLanguage)) locale = savedLanguage;
} catch { /* Language selection also works without storage. */ }
const t = (key, parameters) => translate(locale, key, parameters);
let lastError = null, toastState = null, exporting = false;
let saveState = 'saved';

const $ = id => document.getElementById(id);
const editor = $('editor');
const paper = $('paper');
const preview = $('preview-scroll');
const defaults = { mode: 'paged', width: 210, height: 297, margin: 18, fontSize: 15, lineHeight: 1.8, theme: 'editorial' };
const presets = { a4: [210, 297], a5: [148, 210], letter: [215.9, 279.4] };
const STORAGE_KEY = 'moye-draft-v1';
let settings = { ...defaults };
let renderTimer, saveTimer, toastTimer, fit = true, draftSaved = true;
let source = exampleFor(locale), name = t('exampleName');
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved.markdown === 'string') {
    source = saved.markdown === LEGACY_EXAMPLE ? exampleFor(locale) : saved.markdown;
    name = typeof saved.name === 'string' ? saved.name : name;
    if (saved.markdown === LEGACY_EXAMPLE && name === '我的第一份文档') name = t('exampleName');
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

function toast(key, parameters = {}) {
  toastState = { key, parameters };
  $('toast').textContent = t(key, parameters);
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3200);
}

function saveDraft() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ markdown: editor.value, name: $('filename').value, settings }));
    saveState = 'saved';
    $('save-status').textContent = t(saveState);
    draftSaved = true;
  } catch {
    saveState = 'unsaved';
    $('save-status').textContent = t(saveState);
    draftSaved = false;
  }
}

function scheduleSave() {
  draftSaved = false;
  saveState = 'saving';
  $('save-status').textContent = t(saveState);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
}

function updateCursor() {
  const before = editor.value.slice(0, editor.selectionStart).split('\n');
  $('cursor-position').textContent = t('cursor', { line: before.length, column: before.at(-1).length + 1 });
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
    updateCounts();
    $('line-numbers').textContent = Array.from({ length: editor.value.split('\n').length }, (_, i) => i + 1).join('\n');
    $('line-numbers').style.whiteSpace = 'pre';
    $('math-warning').hidden = !paper.querySelector('.katex-error');
    for (const image of paper.querySelectorAll('img')) image.addEventListener('load', fitPaper, { once: true });
    fitPaper();
    document.fonts.ready.then(fitPaper);
    updateCursor();
  } catch (error) {
    toast('previewFailed', { message: error.message });
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
  updatePageSummary();
  applyDocumentStyle(paper, settings);
  fitPaper();
}

function openExport() {
  updateSettingsUI();
  $('export-error').hidden = true;
  $('export-dialog').showModal();
}

function setError(key, parameters = {}) {
  lastError = { key, parameters };
  $('export-error').textContent = t(key, parameters);
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
  return ($('filename').value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\.(md|markdown|pdf)$/i, '') || t('untitled')) + extension;
}

function saveMarkdown() {
  download(new Blob([editor.value], { type: 'text/markdown;charset=utf-8' }), filename('.md'));
  saveDraft();
  toast('markdownSaved');
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
  const pairs = { bold: ['**', '**', t('boldPlaceholder')], italic: ['*', '*', t('italicPlaceholder')], heading: ['\n## ', '\n', t('headingPlaceholder')], quote: ['\n> ', '\n', t('quotePlaceholder')], link: ['[', '](https://example.com)', t('linkPlaceholder')], code: ['\n```python\n', '\n```\n', 'print("Hello, world!")'], math: ['\n$$\n', '\n$$\n', 'E = mc^2'] };
  if (kind === 'table') return replaceSelection(t('tableTemplate'));
  const [left, right, placeholder] = pairs[kind];
  const inner = selected || placeholder;
  replaceSelection(left + inner + right, left.length, inner.length);
}

async function importMarkdown(file) {
  if (!file) return;
  if (!/\.(md|markdown|txt)$/i.test(file.name)) return toast('fileType');
  if (file.size > 16 * 1024 * 1024) return toast('fileTooLarge');
  try {
    const text = await file.text();
    editor.value = text.replace(/^\uFEFF/, '');
    $('filename').value = file.name.replace(/\.(md|markdown|txt)$/i, '');
    editor.scrollTop = 0;
    preview.scrollTop = 0;
    $('line-numbers').style.transform = '';
    render();
    saveDraft();
    toast('fileOpened', { name: file.name });
  } catch { toast('fileReadFailed'); }
}

async function insertImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) return toast('imageType');
  if (file.size > 5 * 1024 * 1024) return toast('imageTooLarge');
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    if (new Blob([editor.value, data]).size > 16 * 1024 * 1024) return toast('errorDocumentSize');
    replaceSelection(`\n![${file.name.replace(/[\[\]\\]/g, '') || t('image')}](${data})\n`);
    toast('imageEmbedded');
  } catch { toast('imageReadFailed'); }
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
  if (editor.value.trim() && !confirm(t('confirmNew'))) return;
  editor.value = ''; $('filename').value = t('untitled'); render(); saveDraft(); editor.focus();
};
$('load-example').onclick = () => {
  const example = exampleFor(locale);
  if (editor.value !== example && editor.value.trim() && !confirm(t('confirmExample'))) return;
  editor.value = example; $('filename').value = t('exampleName'); render(); saveDraft();
};
$('zoom').onclick = () => { fit = !fit; updateZoomLabel(); fitPaper(); };
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
  if (!editor.value.trim()) return setError('errorEmpty');
  for (const key of ['width', 'height', 'margin', 'fontSize', 'lineHeight']) {
    const input = $(key);
    if (!input.disabled && !input.checkValidity()) {
      return setError('errorRange', { key, low: input.min, high: input.max });
    }
  }
  if (settings.width - 2 * settings.margin < 40) return setError('errorMargin');
  $('export-error').hidden = true;
  const submit = $('export-submit');
  submit.disabled = true;
  exporting = true;
  submit.querySelector('span').textContent = t('exporting');
  const exportName = filename('.pdf');
  try {
    const response = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify({ markdown: editor.value, settings }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw Object.assign(new Error('Export failed'), { key: Object.hasOwn(catalogs.en, data.code) ? data.code : 'errorStatus', parameters: data.params || { status: response.status } });
    }
    download(await response.blob(), exportName);
    $('export-dialog').close();
    toast('pdfExported');
  } catch (error) {
    setError(error.name === 'TimeoutError' ? 'errorTimeout' : error instanceof TypeError ? 'errorNetwork' : error.key || 'errorExport', error.parameters);
  } finally {
    submit.disabled = false;
    exporting = false;
    submit.querySelector('span').textContent = t('exportPdf');
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
refreshLanguage();

function updateCounts() {
  // Counts describe document content and do not change when the UI language changes.
  const count = Array.from(editor.value.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '[image]').replace(/\s/g, '')).length;
  $('word-count').textContent = t('count', { count: count.toLocaleString(locale), lines: editor.value.split('\n').length.toLocaleString(locale) });
}

function updatePageSummary() {
  const selected = Object.entries(presets).find(([, size]) => size[0] === settings.width && size[1] === settings.height);
  const title = selected ? { a4: 'A4', a5: 'A5', letter: 'Letter' }[selected[0]] : t('custom');
  $('page-summary').textContent = settings.mode === 'single' ? t('singleSummary', { width: settings.width }) : `${title} · ${settings.width} × ${settings.height} mm`;
}

function updateZoomLabel() {
  $('zoom').querySelector('[data-i18n]').textContent = t(fit ? 'fitWidth' : 'actualSize');
}

function refreshLanguage() {
  translatePage(locale);
  $('language').value = locale;
  $('save-status').textContent = t(saveState);
  document.querySelector('.export-note').textContent = t('exportNote');
  $('export-submit').querySelector('span').textContent = t(exporting ? 'exporting' : 'exportPdf');
  if (lastError) $('export-error').textContent = t(lastError.key, lastError.parameters);
  if (toastState) $('toast').textContent = t(toastState.key, toastState.parameters);
  updateCounts();
  updateCursor();
  updatePageSummary();
  updateZoomLabel();
  fitPaper();
}

$('language').addEventListener('change', event => {
  locale = resolveLocale(event.target.value);
  try { localStorage.setItem(LANGUAGE_KEY, locale); } catch { /* Current session still switches. */ }
  refreshLanguage();
});
