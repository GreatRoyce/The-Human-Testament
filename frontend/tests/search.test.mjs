import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createContentApi } from '../src/services/api/contentApi.js';
import { manuscriptContentProvider as provider } from '../src/services/manuscriptContent.js';
import { searchService } from '../src/features/search/services/searchService.js';
import { searchPageSchema } from '../src/features/search/types/contracts.js';
import { parseContent } from '../src/features/testament/types/contracts.js';
import { searchResultUrl, searchTargetUrl } from '../src/features/search/utils/searchAddress.js';

test('local paginated search covers all public categories and preserves original note/verse/glossary strings', async () => {
  const verse = await searchService.searchPage('freedom:10:14', { type: 'verse' });
  assert.equal(verse.items[0].verse.text, 'Responsibility is the shadow cast by freedom.');
  const note = await searchService.searchPage('Note 131', { type: 'note' });
  const inferred = note.items.find(item => item.note.noteNumber === 131);
  assert.equal(inferred.note.anchor.status, 'inferred'); assert.equal(inferred.note.anchor.sourceMarkerPresent, false);
  assert.ok(inferred.note.markerText.includes('PROBABLE ANCHOR')); assert.ok(inferred.note.rawText.includes('single incisive question'));
  const glossary = await searchService.searchPage('abstinence', { type: 'glossary', book: 'relationships' });
  assert.equal(glossary.pagination.total, 1); assert.equal(glossary.items[0].entry.term, 'Abstinence');
  const refs = await searchService.searchPage('inquiry:1:6', { type: 'cross-reference' });
  assert.ok(refs.items.some(item => item.origin === 'index')); assert.ok(refs.items.some(item => item.origin === 'note'));
  assert.deepEqual(await searchService.searchPage('no-match-unfindable-49385', { type: 'all' }), { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
  const filtered = await searchService.searchPage('freedom', { book: 'freedom', chapter: 10, type: 'verse', limit: 1 });
  assert.equal(filtered.items.length, 1); assert.equal(filtered.items[0].verse.chapterNumber, 10);
  assert.ok(filtered.pagination.total > 1);
});

test('API search preserves compatible arrays and decodes rich pagination without credentials or rewritten content', async () => {
  const calls = [], expected = provider.searchPage('"honest scrutiny"', { type: 'all' });
  const client = createApiClient({ baseUrl: 'https://api.example.test/prefix', fetchImpl: async (url, init) => {
    calls.push({ url, init }); return Response.json({ success: true, count: expected.items.length, data: expected.items, pagination: expected.pagination });
  } });
  const api = createContentApi(client), signal = new AbortController().signal;
  const result = await api.searchPage('"honest scrutiny"', { book: 'inquiry', chapter: '1', type: 'all', page: '1', limit: '20' }, { signal });
  assert.deepEqual(result, expected); assert.equal(calls[0].url.pathname, '/prefix/api/search');
  assert.equal(calls[0].url.searchParams.get('q'), '"honest scrutiny"'); assert.equal(calls[0].url.searchParams.get('chapter'), '1');
  assert.equal(calls[0].init.signal, signal); assert.equal(calls[0].init.headers.Authorization, undefined); assert.equal(calls[0].init.credentials, undefined);
  assert.deepEqual(await api.search('literal & query'), expected.items);
  const bad = createContentApi({ get: async () => ({ success: true, data: [] }) });
  await assert.rejects(bad.searchPage('query', {}), { code: 'INVALID_RESPONSE' });
});

test('invalid queries and filters fail clearly; supporting-anchor contradictions and malformed totals are rejected', async () => {
  for (const query of ['', ' ', null, [], 'x'.repeat(201), '"unclosed']) await assert.rejects(searchService.searchPage(query), { code: 'INVALID_INPUT', status: 400 });
  for (const filters of [{ page: 0 }, { limit: 51 }, { type: 'private-note' }, { chapter: 1 }, { book: '../inquiry' }])
    await assert.rejects(searchService.searchPage('truth', filters), { code: 'INVALID_INPUT', status: 400 });
  const page = provider.searchPage('Note 131', { type: 'note' });
  const changed = structuredClone(page); changed.items[0].note.anchor.sourceMarkerPresent = true;
  assert.throws(() => parseContent(searchPageSchema, changed), { code: 'INVALID_RESPONSE' });
  const wrong = structuredClone(page); wrong.pagination.total = 'fabricated';
  assert.throws(() => parseContent(searchPageSchema, wrong), { code: 'INVALID_RESPONSE' });
});

test('search result URLs retain stable verse references and exact glossary/index source lines without inventing missing links', () => {
  const verse = provider.searchPage('freedom:10:14', { type: 'verse' }).items[0]; assert.equal(searchResultUrl(verse), '/testament/freedom/10/14');
  const note = provider.searchPage('Note 131', { type: 'note' }).items[0]; assert.equal(searchResultUrl(note), '/testament/inquiry/31/4');
  const glossary = provider.searchPage('Abstinence', { type: 'glossary' }).items[0]; assert.equal(searchResultUrl(glossary), '/testament/materials#source-line-12057');
  const refs = provider.searchPage('inquiry:1:6', { type: 'cross-reference' }).items;
  const index = refs.find(item => item.origin === 'index'); assert.equal(searchResultUrl(index), `/testament/materials#source-line-${index.entry.sourceLines[0]}`);
  assert.equal(searchTargetUrl(index.entry.targets[0]), '/testament/inquiry/1/6');
  assert.equal(searchTargetUrl({ raw: '2:99', referenceExists: false }), undefined);
  assert.equal(searchResultUrl({ ...index, entry: { ...index.entry, sourceLines: [] }, anchorExists: false }), undefined);
});

test('form, result categories, uncertainty notices and paginated search render the existing design with exact original text escaped', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: Form } = await server.ssrLoadModule('/src/features/search/components/SearchForm.jsx');
    const { default: Results } = await server.ssrLoadModule('/src/features/search/components/SearchResults.jsx');
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const render = (Component, props, path = '/search') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    const form = render(Form, { query: 'truth', books: provider.getBooks(), filters: { type: 'all', book: 'inquiry', chapter: '1', limit: '20' }, onSearch: () => {} });
    for (const field of ['q', 'type', 'book', 'chapter', 'limit']) assert.ok(form.includes(`name="${field}"`));
    assert.ok(form.includes('maxLength="200"')); assert.ok(form.includes('type="submit"')); assert.ok(form.includes('exact phrase'));
    assert.ok(render(Form, { query: 'truth', filters: { limit: '30' }, onSearch: () => {} }).includes('value="30" selected=""'));
    const items = [provider.searchPage('freedom:10:14', { type: 'verse' }).items[0], provider.searchPage('Note 131', { type: 'note' }).items[0],
      provider.searchPage('Abstinence', { type: 'glossary' }).items[0], provider.searchPage('inquiry:1:6', { type: 'cross-reference' }).items[0]];
    const html = render(Results, { results: items });
    assert.ok(render(Results, { results: [{ kind: 'verse', reference: items[0].reference, verse: items[0].verse }] }).includes('/testament/freedom/10/14'));
    for (const label of ['Canonical verse', 'Supporting note / reflection', 'Glossary entry', 'Cross-reference', 'Anchor inferred', 'PROBABLE ANCHOR', 'Responsibility is the shadow cast by freedom.', '/testament/materials#source-line-12057']) assert.ok(html.includes(label), label);
    const unsafe = structuredClone(items[0]); unsafe.verse.text = '  <script>alert(1)</script>\nKeep  spacing.  ';
    const escaped = render(Results, { results: [unsafe] }); assert.ok(escaped.includes('&lt;script&gt;')); assert.ok(!escaped.includes('<script>')); assert.ok(escaped.includes('\nKeep  spacing.'));
    const expected = provider.searchPage('responsibility', { type: 'all', limit: 10 }).pagination.total;
    const page = render(Routes, {}, '/search?q=responsibility&type=all&limit=10');
    assert.ok(page.includes(`${expected} manuscript results`)); assert.ok(page.includes('Search result pages')); assert.ok(page.includes('Next'));
    assert.equal((page.match(/<main\b/g) ?? []).length, 1); assert.equal((page.match(/<h1\b/g) ?? []).length, 1);
    const materials = render(Routes, {}, '/testament/materials#source-line-12057'); assert.ok(materials.includes('id="source-line-12057"')); assert.ok(materials.includes('Abstinence'));
    const empty = render(Routes, {}, '/search?q=no-match-unfindable-49385'); assert.ok(empty.includes('0 manuscript results')); assert.ok(empty.includes('No manuscript results on this page'));
  } finally { await server.close(); }
});

test('API-mode rich search forwards filters, exposes unsupported responses clearly and never falls back to local content', async () => {
  const previous = { source: process.env.VITE_CONTENT_SOURCE, url: process.env.VITE_API_URL, fetch: globalThis.fetch };
  process.env.VITE_CONTENT_SOURCE = 'api'; process.env.VITE_API_URL = 'https://search.example.test';
  const calls = []; let unavailable = false;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (unavailable) return Response.json({ success: false, message: 'This content source does not support search.' }, { status: 501 });
    const page = provider.searchPage('responsibility', { type: 'verse', book: 'freedom', chapter: '10', page: '1', limit: '10' });
    return Response.json({ success: true, count: page.items.length, data: page.items, pagination: page.pagination });
  };
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { searchService: service } = await server.ssrLoadModule('/src/features/search/services/searchService.js');
    const result = await service.searchPage('responsibility', { type: 'verse', book: 'freedom', chapter: '10', limit: '10', page: '1' });
    assert.ok(result.items.some(item => item.verse.canonicalId === 'freedom:10:14'));
    const url = new URL(calls[0].url); assert.equal(url.searchParams.get('book'), 'freedom'); assert.equal(url.searchParams.get('chapter'), '10'); assert.equal(url.searchParams.get('limit'), '10');
    assert.equal(service.getInitialPage('responsibility', {}), undefined);
    unavailable = true;
    await assert.rejects(service.searchPage('responsibility'), error => error.status === 501 && error.message === 'This content source does not support search.');
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/search?q=responsibility'] }, createElement(Routes)));
    assert.ok(html.includes('Loading content')); assert.ok(!html.includes('manuscript results'));
  } finally {
    await server.close(); globalThis.fetch = previous.fetch;
    if (previous.source === undefined) delete process.env.VITE_CONTENT_SOURCE; else process.env.VITE_CONTENT_SOURCE = previous.source;
    if (previous.url === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = previous.url;
  }
});
