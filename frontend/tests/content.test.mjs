import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookService } from '../src/features/testament/services/bookService.js';
import { chapterService } from '../src/features/testament/services/chapterService.js';
import { verseService } from '../src/features/testament/services/verseService.js';
import { searchService } from '../src/features/search/services/searchService.js';
import { chapterContentSchema, parseContent } from '../src/features/testament/types/contracts.js';
import { createApiClient } from '../src/services/api/client.js';
import { createContentApi } from '../src/services/api/contentApi.js';

test('book hierarchy retains all ten supplied books; returned data cannot mutate fixtures', async () => {
  const books = await bookService.getBooks();
  assert.equal(books.length, 10);
  assert.equal(books.reduce((sum, book) => sum + book.chapterCount, 0), 231);
  books[0].title = 'changed';
  assert.equal((await bookService.getBook('inquiry')).title, 'Inquiry');
  await assert.rejects(bookService.getBook('unknown'), { code: 'NOT_FOUND', status: 404 });
  await assert.rejects(bookService.getBook('../inquiry'), { code: 'INVALID_INPUT' });
});

test('chapters contain only supplied verses, preserve exact notes, and declare excerpts', async () => {
  const content = await chapterService.getChapter('freedom', 10);
  assert.equal(content.chapter.completeness, 'excerpt');
  assert.deepEqual(content.verses.map((verse) => verse.number), [11, 12, 13, 14]);
  assert.equal(content.verses[1].text, 'Freedom is not the absence of consequences. It is the privilege of selecting them.');
  assert.equal(content.verses[1].commentary.number, 261);
  assert.equal(content.verses[3].commentary.number, 262);
  assert.equal(content.verses[3].commentary.seeAlso.label, 'Inquiry 16:9');
  assert.equal(content.verses[0].commentary, null);
  assert.deepEqual(await chapterService.getChapters('existence'), []);
  await assert.rejects(chapterService.getChapter('freedom', 2), { code: 'NOT_FOUND' });
  await assert.rejects(chapterService.getChapter('freedom', 0), { code: 'INVALID_INPUT' });
  await assert.rejects(chapterService.getChapter('freedom', NaN), { code: 'INVALID_INPUT' });
  await assert.rejects(verseService.getVerse('freedom', 10, 1), { code: 'NOT_FOUND' });
  assert.equal((await verseService.getVerse('freedom', 10, 14)).number, 14);
});

test('search returns fixed verse addresses, treats blank/no-match queries consistently', async () => {
  const results = await searchService.search('  responsibility  ');
  assert.ok(results.some((result) => result.reference === 'Freedom 10:14'));
  assert.ok(results.every((result) => result.kind === 'verse' && result.verse.bookSlug));
  assert.equal((await searchService.search('FREEDOM 10:14'))[0].verse.number, 14);
  assert.deepEqual(await searchService.search(' '), []);
  assert.deepEqual(await searchService.search('unfindable-phrase-987654'), []);
});

test('chapter contract rejects duplicate verses and content at the wrong address', async () => {
  const content = await chapterService.getChapter('freedom', 10);
  assert.throws(() => parseContent(chapterContentSchema, { ...content, verses: [content.verses[0], content.verses[0]] }), { code: 'INVALID_RESPONSE' });
  content.verses[0].bookSlug = 'inquiry';
  assert.throws(() => parseContent(chapterContentSchema, content), { code: 'INVALID_RESPONSE' });
});

test('API client constructs configured URLs, encodes queries and forwards cancellation', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'https://content.example/prefix/', fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  } });
  const controller = new AbortController();
  await client.get('/api/search', { query: { q: 'truth & doubt' }, signal: controller.signal });
  assert.equal(calls[0].url.pathname, '/prefix/api/search');
  assert.equal(calls[0].url.searchParams.get('q'), 'truth & doubt');
  assert.equal(calls[0].init.signal, controller.signal);
  assert.equal(calls[0].init.headers.Accept, 'application/json');
});

test('API errors are normalized, including bad config, network, HTTP and non-JSON responses', async () => {
  await assert.rejects(createApiClient().get('/api/books'), { code: 'CONFIGURATION_ERROR' });
  await assert.rejects(createApiClient({ baseUrl: 'http://' }).get('/api/books'), { code: 'CONFIGURATION_ERROR' });
  const client = (fetchImpl) => createApiClient({ baseUrl: 'https://content.example', fetchImpl });
  await assert.rejects(client(async () => { throw new TypeError('offline'); }).get('/api/books'), { code: 'NETWORK_ERROR' });
  await assert.rejects(client(async () => new Response('', { status: 404 })).get('/api/books'), { code: 'NOT_FOUND', status: 404 });
  await assert.rejects(client(async () => new Response('', { status: 500 })).get('/api/books'), { code: 'HTTP_ERROR', status: 500 });
  await assert.rejects(client(async () => new Response('<html>error</html>')).get('/api/books'), { code: 'INVALID_RESPONSE' });
  const abort = new DOMException('Aborted', 'AbortError');
  await assert.rejects(client(async () => { throw abort; }).get('/api/books'), { name: 'AbortError' });
});

test('REST adapter uses only proposed endpoints; single verse comes from the verses collection', async () => {
  const calls = [];
  const verse = await verseService.getVerse('freedom', 10, 14);
  const api = createContentApi({ get: async (path, options) => { calls.push({ path, options }); return path.endsWith('/verses') ? [verse] : []; } });
  await api.getBooks(); await api.getBook('freedom'); await api.getChapters('freedom');
  await api.getChapter('freedom', 10); await api.getVerses('freedom', 10);
  assert.deepEqual(await api.getVerse('freedom', 10, 14), verse);
  assert.equal(await api.getVerse('freedom', 10, 1), null);
  await api.search('freedom');
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/books', '/api/books/freedom', '/api/books/freedom/chapters',
    '/api/books/freedom/chapters/10', '/api/books/freedom/chapters/10/verses',
    '/api/books/freedom/chapters/10/verses', '/api/books/freedom/chapters/10/verses', '/api/search',
  ]);
  assert.deepEqual(calls.at(-1).options.query, { q: 'freedom' });
});
