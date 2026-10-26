const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'production';
process.env.CONTENT_SOURCE = 'pdf';
const app = require('../src/app');
const dataset = require('../../shared/manuscript.json');

test('the default PDF API serves the complete shared manuscript without a database connection', async () => {
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async route => {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const books = await get('/api/books');
    assert.equal(books.body.data.length, 10);
    assert.equal(books.body.data.reduce((sum, book) => sum + book.chapterCount, 0), 230);
    for (const book of dataset.books) for (const chapter of book.chapters) {
      const result = await get(`/api/books/${book.slug}/chapters/${chapter.number}`);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.verses.length, chapter.referenceCount);
      for (const verse of chapter.verses) assert.equal(result.body.data.verses.find(entry => entry.number === verse.number).text, verse.text);
    }
    const missing = await get('/api/verses/inquiry:31:4');
    assert.equal(missing.body.data.status, 'missing_source_text');
    assert.equal('text' in missing.body.data, false);
    const verse = (await get('/api/books/freedom/chapters/9/verses/7')).body.data;
    assert.equal(verse.source.pdfPage, 83);
    assert.deepEqual(verse.notes, dataset.notes.filter(note => note.noteNumber === 257));
    assert.deepEqual((await get('/api/glossary')).body.data, dataset.glossary);
    assert.deepEqual((await get('/api/cross-references/index')).body.data, dataset.crossReferenceIndex);
    assert.deepEqual((await get('/api/sections')).body.data, dataset.sections);
    assert.equal((await get('/api/search?q=Purpose%203%3A29')).body.data[0].verse.canonicalId, 'purpose:3:29');
    assert.equal((await get('/api/books/relationships/chapters/1/verses/16')).status, 404);
    assert.equal((await get('/api/books/purpose/chapters/4')).status, 404);
    assert.equal((await get('/api/books/inquiry/chapters/0')).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
