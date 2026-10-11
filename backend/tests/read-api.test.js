const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const mongoose = require('mongoose');
process.env.NODE_ENV = 'production';
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
mongoose.set('bufferCommands', false);
const app = require('../src/app');
const Book = require('../src/models/Book');
const Chapter = require('../src/models/Chapter');
const Verse = require('../src/models/Verse');
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
  assert.deepEqual(await get('/api/books'), { status: 200, body: { success: true, count: 1, data: books } });
  assert.deepEqual(calls, [{ filter: { isPublished: true }, projection: 'title slug order description', order: { order: 1 } }]);
  books.length = 0;
  assert.deepEqual(await get('/api/books'), { status: 200, body: { success: true, count: 0, data: [] } });
});

test('book detail enforces publication and missing books return 404', async t => {
  const book = { title: 'Inquiry', slug: 'inquiry', order: 1, description: '' };
  const calls = stubQuery(t, Book, 'findOne', book);
  assert.deepEqual(await get('/api/books/inquiry'), { status: 200, body: { success: true, data: book } });
  assert.deepEqual(calls[0], { filter: { slug: 'inquiry', isPublished: true }, projection: 'title slug order description' });
  stubQuery(t, Book, 'findOne', null);
  assert.deepEqual(await get('/api/books/missing'), { status: 404, body: { success: false, message: 'Book not found.' } });
});

test('chapter responses include only queries for published content and preserve verse text', async t => {
  const book = { _id: 'book-id', title: 'Inquiry', slug: 'inquiry' };
  const chapter = { _id: 'chapter-id', number: 1, title: '' };
  const verses = [{ canonicalId: 'inquiry:1:1', number: 1, text: 'Preserve ?; and original punctuation.', sourceVersion: 'test-only' }];
  const bookCalls = stubQuery(t, Book, 'findOne', book);
  const chapterCalls = stubQuery(t, Chapter, 'findOne', chapter);
  const verseCalls = stubQuery(t, Verse, 'find', verses);
  assert.deepEqual(await get('/api/books/inquiry/chapters/1'), { status: 200, body: {
    success: true, data: { book, chapter: { number: 1, title: '' }, verses },
  } });
  assert.deepEqual(bookCalls[0], { filter: { slug: 'inquiry', isPublished: true }, projection: '_id title slug' });
  assert.deepEqual(chapterCalls[0].filter, { book: 'book-id', number: 1, isPublished: true });
  assert.deepEqual(verseCalls[0], { filter: { chapter: 'chapter-id', book: 'book-id', isPublished: true },
    projection: 'canonicalId number text sourceVersion', order: { number: 1 } });
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
