import zh from '../locales/zh-CN.json' with { type: 'json' };
import en from '../locales/en.json' with { type: 'json' };

export const catalogs = Object.freeze({ 'zh-CN': zh, en });
export const LANGUAGE_KEY = 'md-render-language-v1';

export function resolveLocale(languages, fallback = 'en') {
  for (const language of Array.isArray(languages) ? languages : [languages]) {
    const code = String(language || '').trim().toLowerCase();
    if (/^zh(?:-|$)/.test(code)) return 'zh-CN';
    if (/^en(?:-|$)/.test(code)) return 'en';
  }
  return fallback;
}

export function requestLocale(header) {
  const preferences = String(header || '').split(',').map((value, index) => {
    const [language, ...parameters] = value.trim().split(';');
    const quality = parameters.find(parameter => parameter.trim().startsWith('q='));
    return { language, index, weight: quality ? Number(quality.trim().slice(2)) : 1 };
  }).filter(item => item.weight > 0 && item.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return resolveLocale(preferences.map(item => item.language), 'zh-CN');
}

export function translate(locale, key, parameters = {}) {
  const catalog = catalogs[locale] || en;
  const template = Object.hasOwn(catalog, key) ? catalog[key] : Object.hasOwn(en, key) ? en[key] : key;
  return template.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
}

export function translatePage(locale, root = document) {
  root.documentElement.lang = locale;
  root.title = translate(locale, 'appTitle');
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = translate(locale, element.dataset.i18n);
  }
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, translate(locale, element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}
