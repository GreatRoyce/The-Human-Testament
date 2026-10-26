import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mockContentProvider } from '../src/data/mock/testament/provider.js';

test('API mode exercises the same services, rejects bad responses, and never seeds mock content', async () => {
  const previousSource = process.env.VITE_CONTENT_SOURCE;
  const previousUrl = process.env.VITE_API_URL;
  const previousFetch = globalThis.fetch;
  process.env.VITE_CONTENT_SOURCE = 'api';
  process.env.VITE_API_URL = 'https://content.example';
  let payload = mockContentProvider.getChapter('freedom', 10);
  let status = 200;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url.toString());
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { chapterService } = await server.ssrLoadModule('/src/features/testament/services/chapterService.js');
    const { bookService } = await server.ssrLoadModule('/src/features/testament/services/bookService.js');
    const { verseService } = await server.ssrLoadModule('/src/features/testament/services/verseService.js');
    const { searchService } = await server.ssrLoadModule('/src/features/search/services/searchService.js');
    assert.equal(chapterService.getInitialChapter('freedom', 10), undefined);
    assert.equal(bookService.getInitialBooks(), undefined);
    assert.deepEqual(await chapterService.getChapter('freedom', 10), payload);
    assert.equal(calls.at(-1), 'https://content.example/api/books/freedom/chapters/10');
    payload = { ...payload, chapter: { ...payload.chapter, number: 11 } };
    await assert.rejects(chapterService.getChapter('freedom', 10), { code: 'INVALID_RESPONSE' });
    payload = { records: [] };
    await assert.rejects(bookService.getBooks(), { code: 'INVALID_RESPONSE' });
    payload = mockContentProvider.getBooks();
    assert.equal((await bookService.getBooks()).length, 10);
    payload = mockContentProvider.getBook('inquiry');
    await assert.rejects(bookService.getBook('freedom'), { code: 'INVALID_RESPONSE' });
    payload = mockContentProvider.getVerses('freedom', 10);
    assert.equal((await verseService.getVerse('freedom', 10, 14)).number, 14);
    await assert.rejects(verseService.getVerse('freedom', 10, 999), { code: 'NOT_FOUND' });
    payload = { data: [] };
    await assert.rejects(verseService.getVerse('freedom', 10, 1), { code: 'INVALID_RESPONSE' });
    payload = mockContentProvider.search('responsibility');
    assert.ok((await searchService.search('responsibility')).length > 0);
    assert.equal(new URL(calls.at(-1)).searchParams.get('q'), 'responsibility');
    status = 503;
    await assert.rejects(searchService.search('responsibility'), { code: 'HTTP_ERROR', status: 503 });
    assert.equal(searchService.getInitialResults('responsibility'), undefined);

    const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/testament/freedom/10'] }, createElement(AppRoutes)));
    assert.ok(html.includes('Loading content'));
    assert.ok(!html.includes('Responsibility is the shadow cast by freedom.'));
  } finally {
    await server.close();
    globalThis.fetch = previousFetch;
    if (previousSource === undefined) delete process.env.VITE_CONTENT_SOURCE; else process.env.VITE_CONTENT_SOURCE = previousSource;
    if (previousUrl === undefined) delete process.env.VITE_API_URL; else process.env.VITE_API_URL = previousUrl;
  }
});
