// Starts the existing app on a temporary local port; never starts the importer.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
process.env.NODE_ENV = 'production';
// This diagnostic specifically audits database publication. The complete PDF
// read source is exercised without a database by tests/pdf-content-api.test.js.
process.env.CONTENT_SOURCE = 'database';
const mongoose = require('mongoose');
// Model initialization must not create collections or indexes during this check.
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
mongoose.set('bufferCommands', false);
const app = require('../src/app');
const connectDB = require('../src/config/db');

async function run() {
  const result = { mode: 'read_only', databaseWritesEnabled: false, draftImported: false,
    database: { configured: Boolean(process.env.MONGODB_URI), connected: false, pingPassed: false },
    checks: [], positivePublishedReads: { book: false, chapter: false, verse: false }, limitations: [] };
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function get(route, expected, validate = () => true) {
    const response = await fetch(baseUrl + route, { signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    result.checks.push({ method: 'GET', route, status: response.status,
      passed: response.status === expected && validate(body) });
    return body;
  }
  try {
    await get('/api/health', 200, body => body.success === true && Number.isFinite(Date.parse(body.timestamp)));
    await get('/api/books/inquiry/chapters/0', 400, body => body.success === false);
    if (result.database.configured) {
      // The existing helper logs raw driver errors; suppress them so credentials
      // or connection strings cannot be exposed by this diagnostic script.
      const log = console.log, errorLog = console.error;
      console.log = () => {}; console.error = () => {};
      try {
        await connectDB();
        result.database.connected = true;
        result.database.pingPassed = (await mongoose.connection.db.command({ ping: 1 })).ok === 1;
      } catch (error) {
        result.database.error = { name: error.name, code: error.code ?? error.cause?.code ?? null };
      } finally { console.log = log; console.error = errorLog; }
    }
    if (result.database.connected && result.database.pingPassed) {
      const books = await get('/api/books', 200, body => body.success === true &&
        Array.isArray(body.data) && body.count === body.data.length &&
        body.data.every((book, index, entries) => typeof book.slug === 'string' &&
          (index === 0 || entries[index - 1].order <= book.order)));
      const missing = 'read-only-check-missing-book';
      await get(`/api/books/${missing}`, 404, body => body.message === 'Book not found.');
      await get(`/api/books/${missing}/chapters/1`, 404, body => body.message === 'Book not found.');
      for (const suffix of ['/chapters', '/chapters/1/verses', '/chapters/1/verses/1', '/chapters/1/verses/1/supporting-material'])
        await get(`/api/books/${missing}${suffix}`, 404, body => body.message === 'Book not found.');
      for (const route of ['/api/glossary', '/api/cross-references', '/api/cross-references/index', '/api/sections'])
        await get(route, 200, body => body.success === true && Array.isArray(body.data));
      if (books.data.length) {
        const slug = books.data[0].slug;
        await get(`/api/books/${encodeURIComponent(slug)}`, 200, body => body.success === true && body.data.slug === slug && Array.isArray(body.data.chapters));
        result.positivePublishedReads.book = result.checks.at(-1).passed;
        // Select existing published chapters without creating test fixtures.
        const editionId = books.data[0].editionId;
        const book = await mongoose.model('Book').findOne({ slug, editionId, isPublished: true }).select('_id').lean();
        const chapter = await mongoose.model('Chapter').findOne({ book: book._id, editionId, isPublished: true }).sort({ number: 1 }).lean();
        if (chapter) {
          const body = await get(`/api/books/${encodeURIComponent(slug)}/chapters/${chapter.number}`, 200,
            body => body.success === true && body.data.book.slug === slug && body.data.chapter.number === chapter.number &&
              Array.isArray(body.data.verses) && body.data.verses.every((verse, index, entries) =>
                (verse.status === 'missing_source_text' ? verse.text === undefined : typeof verse.text === 'string') &&
                (index === 0 || entries[index - 1].number < verse.number)));
          result.publishedVerseCountInCheckedChapter = body.data?.verses?.length ?? 0;
          result.positivePublishedReads.chapter = result.checks.at(-1).passed;
          result.positivePublishedReads.verse = result.positivePublishedReads.chapter && result.publishedVerseCountInCheckedChapter > 0;
          if (!result.positivePublishedReads.verse) result.limitations.push('The checked chapter has no published verses; positive verse reads remain unverified against live data.');
        } else result.limitations.push('No published chapter exists in the first published book; positive chapter/verse reads could not be exercised against live data.');
        await get(`/api/books/${encodeURIComponent(slug)}/chapters/9007199254740991`, 404,
          body => body.message === 'Chapter not found.');
      } else {
        result.limitations.push('No published books exist; positive book/chapter/verse reads cannot be exercised against live data without importing content.');
      }
    } else {
      result.limitations.push('Database-dependent book/chapter/verse reads were not verified because the configured database connection or ping failed.');
    }
    result.passed = result.database.connected && result.database.pingPassed && result.checks.every(check => check.passed);
    result.verificationStatus = result.passed ? (result.limitations.length ? 'PARTIAL' : 'VERIFIED') : 'FAILED';
  } finally {
    await mongoose.disconnect();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log(JSON.stringify(result, null, 2));
  return result.passed ? 0 : 1;
}

if (require.main === module) run().then(code => { process.exitCode = code; }).catch(error => {
  console.error(JSON.stringify({ mode: 'read_only', passed: false, error: { name: error.name, code: error.code ?? null } }));
  process.exitCode = 1;
});

module.exports = { run };
