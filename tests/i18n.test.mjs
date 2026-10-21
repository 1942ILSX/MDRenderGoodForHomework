import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogs, resolveLocale, requestLocale, translate } from '../src/i18n.js';

test('every UI hook and error code has matching translations and parameters', async () => {
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs['zh-CN']).sort());
  for (const key of Object.keys(catalogs.en)) {
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(catalogs.en[key]), placeholders(catalogs['zh-CN'][key]), key);
  }
  const html = await readFile(new URL('../static/index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-title|-aria-label|-placeholder)?="([^"]+)"/g)) {
    assert.ok(Object.hasOwn(catalogs.en, key), key);
  }
  assert.equal(translate('en', 'errorRange', { key: 'width', low: 80, high: 420 }), 'width must be between 80 and 420.');
});

test('language negotiation respects supported preferences, regions and quality weights', () => {
  assert.equal(resolveLocale(['fr-FR', 'zh-TW', 'en']), 'zh-CN');
  assert.equal(resolveLocale('en-GB'), 'en');
  assert.equal(resolveLocale('fr'), 'en');
  assert.equal(requestLocale('zh-CN;q=0.2,en-US;q=0.9'), 'en');
  assert.equal(requestLocale('en;q=0,zh-HK;q=0.5'), 'zh-CN');
  assert.equal(requestLocale(''), 'zh-CN');
});
