const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
process.env.NODE_ENV = 'production';
process.env.CONTENT_SOURCE = 'database';
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
mongoose.set('bufferCommands', false);
const app = require('../src/app');
const Book = require('../src/models/Book');
const Chapter = require('../src/models/Chapter');
const Verse = require('../src/models/Verse');
const Edition = require('../src/models/Edition');
const Note = require('../src/models/Note');
const CrossReference = require('../src/models/CrossReference');
const ContentSection = require('../src/models/ContentSection');
const { fixture } = require('../test-fixtures/canonical');
const editionId = fixture().edition.editionId;
const bookProjection = 'title slug order description subtitle chapterCount sourceVersion editionId';
const publicBook = book => ({ slug: book.slug, title: book.title, order: book.order,
  numberLabel: 'I', subtitle: book.subtitle ?? '', description: book.description ?? '',
  ...(book.chapterCount ? { chapterCount: book.chapterCount } : {}) });
let server, baseUrl;

before(async () => {
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(t => {
  stubQuery(t, Edition, 'findOne', fixture().edition);
  for (const model of [Note, CrossReference, ContentSection, Chapter]) stubQuery(t, model, 'find', []);
});

async function get(route) {
  const response = await fetch(baseUrl + route, { signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json() };
}

// Query doubles exercise the mounted HTTP routes without any database or seeding.
function stubQuery(t, model, method, value) {
  const calls = [];
  t.mock.method(model, method, filter => {
    const call = { filter }; calls.push(call);
    const query = {
      select(projection) { call.projection = projection; return query; },
      sort(order) { call.order = order; return query; },
      lean() { return Promise.resolve(value); },
      then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
    };
    return query;
  });
  return calls;
}

test('health is reachable without database access and unknown routes return JSON 404', async t => {
  t.mock.method(Book, 'find', () => { throw new Error('Unexpected database read'); });
  const health = await get('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.success, true);
  assert.ok(Number.isFinite(Date.parse(health.body.timestamp)));
  assert.deepEqual(await get('/api/does-not-exist'), { status: 404, body: { success: false, message: 'API endpoint not found.' } });
});

test('book list reads only published books, requests stable ordering, and handles an empty result', async t => {
  const books = [{ title: 'Inquiry', slug: 'inquiry', order: 1, description: '' }];
  const calls = stubQuery(t, Book, 'find', books);
  assert.deepEqual(await get('/api/books'), { status: 200, body: { success: true, count: 1, data: books.map(publicBook) } });
  assert.deepEqual(calls, [{ filter: { editionId, isPublished: true }, projection: bookProjection, order: { order: 1 } }]);
  books.length = 0;
  assert.deepEqual(await get('/api/books'), { status: 200, body: { success: true, count: 0, data: [] } });
});

test('book detail enforces publication and missing books return 404', async t => {
  const book = { title: 'Inquiry', slug: 'inquiry', order: 1, description: '' };
  const calls = stubQuery(t, Book, 'findOne', book);
  assert.deepEqual(await get('/api/books/inquiry'), { status: 200, body: { success: true, data: { ...publicBook(book), chapters: [] } } });
  assert.deepEqual(calls[0], { filter: { editionId, slug: 'inquiry', isPublished: true }, projection: '_id ' + bookProjection });
  stubQuery(t, Book, 'findOne', null);
  assert.deepEqual(await get('/api/books/missing'), { status: 404, body: { success: false, message: 'Book not found.' } });
});

test('chapter responses include only queries for published content and preserve verse text', async t => {
  const book = { _id: 'book-id', title: 'Inquiry', slug: 'inquiry', order: 1, chapterCount: 1 };
  const chapter = { _id: 'chapter-id', bookSlug: 'inquiry', number: 1, title: '', referenceCount: 1 };
  const verses = [{ canonicalId: 'inquiry:1:1', bookSlug: 'inquiry', chapterNumber: 1, number: 1, text: 'Preserve ?; and original punctuation.', sourceVersion: 'test-only' }];
  const bookCalls = stubQuery(t, Book, 'findOne', book);
  const chapterCalls = stubQuery(t, Chapter, 'findOne', chapter);
  const verseCalls = stubQuery(t, Verse, 'find', verses);
  assert.deepEqual(await get('/api/books/inquiry/chapters/1'), { status: 200, body: {
    success: true, data: { book: publicBook(book), chapter: { bookSlug: 'inquiry', number: 1, title: '', referenceCount: 1, completeness: 'complete' },
      verses: verses.map(verse => ({ ...verse, status: 'authored', notes: [], crossReferences: [] })), notes: [], crossReferences: [], sections: [] },
  } });
  assert.deepEqual(bookCalls[0], { filter: { editionId, slug: 'inquiry', isPublished: true }, projection: '_id ' + bookProjection });
  assert.deepEqual(chapterCalls[0].filter, { editionId, book: 'book-id', number: 1, isPublished: true });
  assert.deepEqual(verseCalls[0], { filter: { editionId, chapter: 'chapter-id', book: 'book-id', isPublished: true },
    projection: 'canonicalId bookSlug chapterNumber number text status unresolved source sourceVersion editionId', order: { number: 1 } });
});

test('invalid chapter numbers fail before querying the database', async t => {
  t.mock.method(Book, 'findOne', () => { throw new Error('Unexpected database read'); });
  for (const number of ['0', '-1', '1.5', 'NaN', '9007199254740992']) {
    const result = await get(`/api/books/inquiry/chapters/${number}`);
    assert.equal(result.status, 400);
    assert.equal(result.body.message, 'Chapter number must be a positive integer.');
  }
});

test('missing chapter and book responses stop before verse queries', async t => {
  const book = { _id: 'book-id', title: 'Inquiry', slug: 'inquiry' };
  stubQuery(t, Book, 'findOne', book);
  const chapterCalls = stubQuery(t, Chapter, 'findOne', null);
  t.mock.method(Verse, 'find', () => { throw new Error('Unexpected verse query'); });
  assert.deepEqual(await get('/api/books/inquiry/chapters/999'), { status: 404, body: { success: false, message: 'Chapter not found.' } });
  assert.equal(chapterCalls.length, 1);
  stubQuery(t, Book, 'findOne', null);
  assert.deepEqual(await get('/api/books/missing/chapters/1'), { status: 404, body: { success: false, message: 'Book not found.' } });
  assert.equal(chapterCalls.length, 1);
});

test('database errors use the public error response without exposing driver details', async t => {
  t.mock.method(Book, 'find', () => { throw new Error('Private driver diagnostic'); });
  t.mock.method(console, 'error', () => {});
  const result = await get('/api/books');
  assert.deepEqual(result, { status: 500, body: { success: false, message: 'An unexpected server error occurred.' } });
});
