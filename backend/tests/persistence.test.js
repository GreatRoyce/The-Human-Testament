// Real storage/HTTP tests use a disposable local mongod and SYNTHETIC content.
// This file never loads .env or uses MONGODB_URI.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
process.env.NODE_ENV = 'production';
process.env.CONTENT_SOURCE = 'database';
mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
const { fixture, text } = require('../test-fixtures/canonical');
const app = require('../src/app');
const models = Object.fromEntries(['Edition','Book','Chapter','Verse','Note','CrossReference','CrossReferenceIndex','GlossaryEntry','ContentSection']
  .map(name => [name, require('../src/models/' + name)]));
const keys = { Edition: ['editionId'], Book: ['editionId','slug'], Chapter: ['editionId','book','number'],
  Verse: ['editionId','canonicalId'], Note: ['editionId','noteNumber'], CrossReference: ['editionId','id'],
  CrossReferenceIndex: ['editionId','id'], GlossaryEntry: ['editionId','term'], ContentSection: ['editionId','id'] };
const clean = record => Object.fromEntries(Object.entries(record).filter(([key]) => !['_id','__v','createdAt','updatedAt','isPublished'].includes(key)));

test('real MongoDB persistence and HTTP preserve synthetic edition content without touching configured storage', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryServer.create({ instance: { dbName: 'human_testament_fidelity_test' } });
  const uri = memory.getUri(); assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
  let server;
  try {
    await mongoose.connect(uri, { dbName: 'human_testament_fidelity_test', autoCreate: false, autoIndex: false });
    for (const model of Object.values(models)) { await model.createCollection(); await model.createIndexes(); }
    const value = fixture();
    const collections = { Edition: [value.edition], Book: value.books, Chapter: value.chapters, Verse: value.verses, Note: value.notes,
      CrossReference: value.crossReferences, CrossReferenceIndex: value.index, GlossaryEntry: value.glossary, ContentSection: value.sections };
    async function persist() {
      for (const [name, records] of Object.entries(collections)) for (const record of records) {
        await new models[name](record).validate();
        const filter = Object.fromEntries(keys[name].map(key => [key, record[key]]));
        const { _id, ...data } = record;
        await models[name].updateOne(filter, { $set: data, ...(_id ? { $setOnInsert: { _id } } : {}) }, { upsert: true, runValidators: true });
      }
    }
    await persist();
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const get = async route => { const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
      return { status: response.status, body: await response.json() }; };

    await t.test('complete chapters, repeated verses, Unicode, surrounding spaces and paragraphs survive storage and JSON', async () => {
      const stored = await models.Verse.find({ editionId: value.edition.editionId, chapterNumber: 1 }).sort({ number: 1 }).lean();
      assert.equal(stored[0].text, text); assert.equal(stored[1].text, text); assert.ok(!('text' in stored[2]));
      const response = await get('/api/books/fixture/chapters/1'); assert.equal(response.status, 200);
      assert.equal(response.body.data.verses.length, 3); assert.equal(response.body.data.chapter.completeness, 'source_incomplete');
      for (const verse of value.verses.filter(verse => verse.chapterNumber === 1)) {
        const actual = response.body.data.verses.find(entry => entry.number === verse.number);
        assert.equal(actual.canonicalId, verse.canonicalId); assert.equal(actual.status, verse.status);
        if (verse.status === 'authored') assert.equal(actual.text, verse.text); else assert.ok(!('text' in actual));
      }
      const book = await get('/api/books/fixture'); assert.equal(book.status, 200);
      assert.equal(book.body.data.title, value.books[0].title); assert.equal(book.body.data.chapters.length, 2);
      assert.equal((await get('/api/books/fixture/chapters')).body.data.length, 2);
      assert.equal((await get('/api/verses/fixture:1:1')).body.data.text, text);
      assert.equal((await get('/api/books/fixture/chapters/1/verses')).body.data.length, 3);
      assert.equal((await get('/api/books/fixture/chapters/1/verses/99')).status, 404);
    });
    await t.test('all note categories, raw citations, inferred anchors and unresolved relationships survive storage and HTTP', async () => {
      const chapter = (await get('/api/books/fixture/chapters/1')).body.data;
      assert.deepEqual(chapter.notes, value.notes.map(clean));
      assert.deepEqual(chapter.crossReferences, value.crossReferences.map(clean));
      assert.deepEqual(chapter.sections, [clean(value.sections[2])]);
      const missing = await get('/api/books/fixture/chapters/1/verses/3');
      assert.equal(missing.status, 200); assert.equal(missing.body.data.status, 'missing_source_text'); assert.ok(!('text' in missing.body.data));
      assert.equal(missing.body.data.notes[0].anchor.status, 'inferred'); assert.equal(missing.body.data.notes[0].anchor.sourceMarkerPresent, false);
      const support = await get('/api/books/fixture/chapters/1/verses/1/supporting-material');
      assert.equal(support.body.data.notes.length, 2); assert.equal(support.body.data.notes[0].text, value.notes[0].text);
      const invalid = (await get('/api/books/fixture/chapters/1/verses/2')).body.data.crossReferences[0];
      assert.equal(invalid.targets[0].status, 'missing_reference'); assert.equal(invalid.reviewRequired, true);
    });
    await t.test('complete glossary, index, citations and front/back matter are retrieved exactly', async () => {
      for (const [route, records] of [['/api/glossary', value.glossary], ['/api/cross-references', value.crossReferences],
        ['/api/cross-references/index', value.index], ['/api/sections', value.sections]]) {
        const actual = await get(route); assert.equal(actual.status, 200); assert.deepEqual(actual.body.data, records.map(clean));
      }
    });
    await t.test('real database to HTTP to frontend adapter preserves exact content and complete supporting collections', async () => {
      const { createApiClient } = await import('../../frontend/src/services/api/client.js');
      const { createContentApi } = await import('../../frontend/src/services/api/contentApi.js');
      const { chapterContentSchema, parseContent } = await import('../../frontend/src/features/testament/types/contracts.js');
      const api = createContentApi(createApiClient({ baseUrl: `http://127.0.0.1:${server.address().port}` }));
      const chapter = parseContent(chapterContentSchema, await api.getChapter('fixture', 1));
      assert.equal(chapter.book.editionId, value.edition.editionId);
      assert.equal(chapter.chapter.referenceCount, 3);
      assert.equal(chapter.verses[0].text, text);
      assert.deepEqual(chapter.notes, value.notes.map(clean));
      assert.deepEqual(chapter.verses[0].notes, value.notes.slice(0, 2).map(clean));
      assert.equal(chapter.verses[2].notes[0].anchor.status, 'inferred');
      assert.ok(!('text' in chapter.verses[2]));
    });
    await t.test('repeated persistence is idempotent and every domain identity has duplicate protection', async () => {
      await persist();
      for (const [name, records] of Object.entries(collections)) {
        assert.equal(await models[name].countDocuments(), records.length, name);
        const { _id, ...duplicate } = records[0];
        await assert.rejects(models[name].create(duplicate), error => error.code === 11000, name);
      }
    });
    await t.test('draft editions and unpublished records cannot leak through published endpoints', async () => {
      await models.Book.create({ ...value.books[0], _id: new mongoose.Types.ObjectId(), slug: 'hidden', order: 2, isPublished: false });
      const draft = { ...value.edition, editionId: 'unapproved-test-edition', approvalStatus: 'DRAFT_REVIEW_REQUIRED', isPublished: false };
      await models.Edition.create(draft);
      await models.Book.create({ ...value.books[0], _id: new mongoose.Types.ObjectId(), slug: 'draft', editionId: draft.editionId });
      assert.equal((await get('/api/books')).body.data.length, 1);
      assert.equal((await get('/api/books/hidden')).status, 404); assert.equal((await get('/api/books/draft')).status, 404);
      await models.Edition.collection.updateOne({ editionId: value.edition.editionId }, { $set: { approvalStatus: 'DRAFT_REVIEW_REQUIRED' } });
      assert.deepEqual((await get('/api/books')).body.data, []); assert.deepEqual((await get('/api/glossary')).body.data, []);
      assert.equal((await get('/api/verses/fixture:1:1')).status, 404);
      await models.Edition.collection.updateOne({ editionId: value.edition.editionId }, { $set: { approvalStatus: 'APPROVED' } });
    });
    await t.test('corrupt stored verse text is rejected instead of serving editorial metadata', async () => {
      await models.Verse.collection.updateOne({ canonicalId: 'fixture:1:1' }, { $set: { text: '[[FLAG: CORRUPTED RECORD]]' } });
      const actual = await get('/api/verses/fixture:1:1'); assert.equal(actual.status, 500); assert.ok(!JSON.stringify(actual.body).includes('CORRUPTED'));
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});
