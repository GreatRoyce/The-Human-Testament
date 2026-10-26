const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.CONTENT_SOURCE = 'database'; process.env.NODE_ENV = 'production';
mongoose.set('autoCreate', false); mongoose.set('autoIndex', false);
const app = require('../src/app');
const { fixture, text } = require('../test-fixtures/canonical');
const models = Object.fromEntries(['Edition', 'Book', 'Chapter', 'Verse', 'Note', 'GlossaryEntry', 'CrossReference', 'CrossReferenceIndex', 'ContentSection'].map(name => [name, require('../src/models/' + name)]));

test('database search uses only complete approved published content with the same ranking engine and no private activity reads', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryServer.create(); let server;
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_search_test' });
    for (const Model of Object.values(models)) { await Model.createCollection(); await Model.createIndexes(); }
    const data = fixture();
    // Provide synthetic source paragraphs for accurate glossary/index links.
    data.sections[1].lines.push(...data.glossary.flatMap(entry => entry.sourceLines.map((line, index) => ({ line, raw: index === 0 ? entry.term : entry.definition }))),
      ...data.index.flatMap(entry => entry.sourceLines.map((line, index) => ({ line, raw: index === 0 ? entry.rawSource : entry.raw }))));
    const values = { Edition: [data.edition], Book: data.books, Chapter: data.chapters, Verse: data.verses, Note: data.notes,
      GlossaryEntry: data.glossary, CrossReference: data.crossReferences, CrossReferenceIndex: data.index, ContentSection: data.sections };
    for (const [name, rows] of Object.entries(values)) await models[name].insertMany(rows);
    await models.Note.create({ ...data.notes[0], noteNumber: 999, text: 'DO_NOT_SEARCH_DRAFT_OR_PRIVATE', rawText: 'DO_NOT_SEARCH_DRAFT_OR_PRIVATE', isPublished: false });
    for (const name of ['PrivateNote', 'Bookmark', 'ReadingProgress', 'ReadingHistory', 'User']) {
      const Model = require('../src/models/' + name);
      await Model.collection.insertOne({ user: new mongoose.Types.ObjectId(), content: 'DO_NOT_SEARCH_DRAFT_OR_PRIVATE', text: 'DO_NOT_SEARCH_DRAFT_OR_PRIVATE' });
      t.mock.method(Model, 'find', () => { throw new Error('Public search read private activity'); });
    }
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const get = async params => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(20000) });
      return { status: response.status, body: await response.json() };
    };
    await t.test('canonical verses preserve exact Unicode and duplicate passages under distinct identifiers', async () => {
      const result = await get({ q: 'quotation', type: 'verse' }); assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.pagination.total, 2); assert.deepEqual(result.body.data.map(item => item.verse.canonicalId), ['fixture:1:1', 'fixture:1:2']);
      assert.ok(result.body.data.every(item => item.verse.text === text));
      assert.equal(result.body.data[0].verse.commentary, null);
    });
    await t.test('notes, glossary and cross-reference results retain anchors, markers, exact definitions and unresolved targets', async () => {
      const notes = await get({ q: 'Keep this line.', type: 'note', book: 'fixture', chapter: '1', limit: '50' });
      assert.equal(notes.status, 200); assert.equal(notes.body.pagination.total, 4);
      const inferred = notes.body.data.find(item => item.note.noteNumber === 4).note;
      assert.equal(inferred.anchor.status, 'inferred'); assert.equal(inferred.anchor.sourceMarkerPresent, false);
      assert.equal(inferred.markerText, data.notes[3].markerText); assert.equal(inferred.rawText, data.notes[3].rawText);
      const glossary = await get({ q: 'Synthetic term', type: 'glossary' });
      assert.equal(glossary.status, 200); assert.equal(glossary.body.data[0].entry.definition, data.glossary[0].definition);
      const refs = await get({ q: '2:99', type: 'cross-reference' }); assert.equal(refs.status, 200); assert.equal(refs.body.pagination.total, 2);
      assert.ok(refs.body.data.every(item => item.entry.targets[0].status === 'missing_reference' && item.entry.targets[0].referenceExists === false));
    });
    await t.test('publication, privacy, stable pagination and exact totals remain enforced in database mode', async () => {
      const hidden = await get({ q: 'DO_NOT_SEARCH_DRAFT_OR_PRIVATE', type: 'all' }); assert.equal(hidden.status, 200); assert.equal(hidden.body.pagination.total, 0);
      const first = await get({ q: 'synthetic', type: 'all', limit: '2' });
      const second = await get({ q: 'synthetic', type: 'all', limit: '2', page: '2' });
      assert.equal(first.status, 200); assert.equal(second.status, 200); assert.ok(first.body.pagination.total > 2);
      assert.equal(new Set([...first.body.data, ...second.body.data].map(item => item.id)).size, 4);
      assert.deepEqual((await get({ q: 'synthetic', type: 'all', limit: '2' })).body, first.body);
      assert.equal((await get({ q: 'synthetic', book: 'missing' })).status, 400);
      assert.equal((await get({ q: 'synthetic', book: 'fixture', chapter: '99' })).status, 400);
    });
    await t.test('approval withdrawal, unpublished parents and missing collections fail closed without PDF fallback', async () => {
      await models.Edition.updateOne({ editionId: data.edition.editionId }, { $set: { isPublished: false } });
      assert.equal((await get({ q: 'quotation', type: 'all' })).status, 503);
      await models.Edition.updateOne({ editionId: data.edition.editionId }, { $set: { isPublished: true } });
      const parent = await models.Book.create({ ...data.books[0], _id: new mongoose.Types.ObjectId(), slug: 'hidden-fixture', order: 2, chapterCount: 1, isPublished: false });
      const child = await models.Chapter.create({ ...data.chapters[0], _id: new mongoose.Types.ObjectId(), book: parent._id, bookSlug: 'hidden-fixture', referenceCount: 1 });
      const hidden = await models.Verse.create({ ...data.verses[0], _id: new mongoose.Types.ObjectId(), book: parent._id, chapter: child._id,
        bookSlug: 'hidden-fixture', canonicalId: 'hidden-fixture:1:1', text: 'DO_NOT_SEARCH_UNPUBLISHED_PARENT' });
      const incomplete = await get({ q: 'DO_NOT_SEARCH_UNPUBLISHED_PARENT', type: 'all' }); assert.equal(incomplete.status, 503); assert.equal(incomplete.body.data, undefined);
      await models.Verse.deleteOne({ _id: hidden._id }); await models.Chapter.deleteOne({ _id: child._id }); await models.Book.deleteOne({ _id: parent._id });
      await models.GlossaryEntry.collection.drop();
      const result = await get({ q: 'freedom', type: 'all' }); assert.equal(result.status, 503);
      assert.equal(result.body.success, false); assert.equal(result.body.data, undefined);
      assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/books`)).status, 200);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});
