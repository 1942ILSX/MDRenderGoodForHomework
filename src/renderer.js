import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import taskLists from 'markdown-it-task-lists';
import katex from 'katex';
import hljs from 'highlight.js/lib/common';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

const md = new MarkdownIt({
  html: false, linkify: true, typographer: true,
  highlight(code, lang) {
    return lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : '';
  },
}).use(texmath, { engine: katex, delimiters: ['dollars', 'brackets'], katexOptions: { throwOnError: false, strict: 'ignore', trust: false, maxExpand: 1000, maxSize: 30 } }).use(taskLists);

const defaultLink = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLink(tokens, idx, options, env, self);
};

export function renderMarkdown(source) {
  return md.render(source);
}

export function applyDocumentStyle(element, settings) {
  element.dataset.theme = settings.theme;
  element.style.fontSize = `${settings.fontSize}px`;
  element.style.lineHeight = settings.lineHeight;
  element.style.setProperty('--image-max-height', settings.mode === 'paged' ? `${settings.height - 2 * settings.margin}mm` : 'none');
}

window.renderForPrint = async ({ markdown, settings }) => {
  const document = window.document;
  const article = document.querySelector('#print-content');
  article.innerHTML = renderMarkdown(markdown);
  applyDocumentStyle(article, settings);
  article.style.width = `${settings.width - 2 * settings.margin}mm`;
  document.body.dataset.mode = settings.mode;
  await Promise.all([...article.querySelectorAll('img')].map(img => new Promise(resolve => {
    if (img.complete) return resolve();
    img.onload = img.onerror = resolve;
    setTimeout(resolve, 15000);
  })));
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    height: article.getBoundingClientRect().height,
    brokenImages: [...article.querySelectorAll('img')].filter(img => !img.complete || !img.naturalWidth).length,
    overflow: article.scrollWidth > article.clientWidth + 3 || [...article.querySelectorAll('pre, .katex-display, table')].some(el => el.scrollWidth > article.clientWidth + 3),
  };
};
