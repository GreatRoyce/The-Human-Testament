const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
process.env.CONTENT_SOURCE = 'pdf'; process.env.NODE_ENV = 'production';
const app = require('../src/app');
const manuscript = require('../../shared/manuscript.json');
const content = require('../src/services/readContent.service');
const { fixture } = require('../test-fixtures/canonical');
const { createDatabaseSearch } = require('../src/services/databaseSearch.service');
const hash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');

test('shared search ranks literal exact, phrase and all-term matches with stable canonical ties', async () => {
  const { createPublicSearch } = await import('../../shared/search.mjs');
  const index = createPublicSearch({ books: [{ slug: 'fixture', title: 'Fixture', order: 1 }], chapters: [{ bookSlug: 'fixture', number: 1 }],
    verses: ['Silver objects beside a river', '  A SILVER\n\triver flows.  ', 'silver river', 'silver river'].map((text, index) => ({ canonicalId: `fixture:1:${index + 1}`, bookSlug: 'fixture', chapterNumber: 1, number: index + 1, text })),
    notes: [], glossary: [], crossReferences: [], crossReferenceIndex: [] });
  const result = index.searchPage('  SILVER   river  ', { type: 'verse', limit: 2 });
  assert.deepEqual(result.items.map(item => item.verse.number), [3, 4]); assert.equal(result.pagination.total, 4);
  assert.ok(result.items.every(item => item.match === 'exact'));
  const next = index.searchPage('silver river', { type: 'verse', limit: 2, page: 2 });
  assert.deepEqual(next.items.map(item => [item.verse.number, item.match]), [[2, 'phrase'], [1, 'terms']]);
  assert.equal(next.items[0].verse.text, '  A SILVER\n\triver flows.  ');
  const quoted = index.searchPage('"silver river"'); assert.equal(quoted.pagination.total, 3);
  assert.deepEqual(index.searchPage('silver river', { page: 99 }).items, []);
  assert.equal(index.searchPage('silver rivers').pagination.total, 0); // No stemming or expansion.
  assert.equal(index.searchPage('silvr').pagination.total, 0); // No fuzzy matches.
  assert.equal(index.searchPage('.*').pagination.total, 0); // Not a regex.
});

test('full PDF corpus search preserves original text, references, notes, uncertainty, glossary and both citation origins', async () => {
  const { createManuscriptProvider } = await import('../../shared/manuscript.mjs');
  const before = hash(), provider = createManuscriptProvider(manuscript);
  const verse = provider.searchPage('freedom:10:14', { type: 'verse' }).items[0];
  assert.equal(verse.verse.canonicalId, 'freedom:10:14'); assert.equal(verse.match, 'exact');
  assert.equal(verse.verse.text, 'Responsibility is the shadow cast by freedom.');
  const notes = provider.searchPage('Note 131', { type: 'note' });
  const inferred = notes.items.find(item => item.note.noteNumber === 131);
  assert.ok(inferred); assert.deepEqual(inferred.note, manuscript.notes.find(note => note.noteNumber === 131));
  assert.equal(inferred.note.anchor.status, 'inferred'); assert.equal(inferred.note.anchor.sourceMarkerPresent, false);
  const explicit = provider.searchPage('Note 1', { type: 'note' }).items[0];
  assert.equal(explicit.note.noteNumber, 1); assert.equal(explicit.note.anchor.status, 'explicit');
  const glossary = provider.searchPage('Abstinence', { type: 'glossary' });
  assert.deepEqual(glossary.items[0].entry, manuscript.glossary[0]);
  const refs = provider.searchPage('inquiry:1:6', { type: 'cross-reference' });
  assert.ok(refs.items.some(item => item.origin === 'index')); assert.ok(refs.items.some(item => item.origin === 'note'));
  for (const item of refs.items) assert.deepEqual(item.entry, (item.origin === 'index' ? manuscript.crossReferenceIndex : manuscript.crossReferences).find(entry => entry.id === item.entry.id));
  const missing = provider.searchPage('Inquiry 31:4', { type: 'verse' }).items[0];
  assert.equal(missing.verse.status, 'missing_source_text'); assert.equal(missing.verse.text, undefined);
  const filtered = provider.searchPage('freedom', { book: 'freedom', chapter: 10, type: 'all', limit: 50 });
  assert.ok(filtered.items.length); assert.ok(filtered.items.every(item => item.kind !== 'glossary'));
  assert.ok(filtered.items.every(item => item.kind === 'verse' ? item.verse.bookSlug === 'freedom' && item.verse.chapterNumber === 10 :
    (item.note ?? item.entry).anchor.bookSlug === 'freedom' && (item.note ?? item.entry).anchor.chapter === 10));
  const again = provider.searchPage('freedom', { book: 'freedom', chapter: 10, type: 'all', limit: 50 });
  assert.deepEqual(again, filtered);
  filtered.items[0].reference = 'Must not mutate provider'; assert.notDeepEqual(filtered, again);
  assert.equal(hash(), before);
});

test('search validates malformed filters/queries and has consistent page boundaries without rewriting queries into regexes', async () => {
  const { createManuscriptProvider } = await import('../../shared/manuscript.mjs');
  const provider = createManuscriptProvider(manuscript);
  for (const query of ['', '  ', null, 12, [], {}, 'x'.repeat(201), '"unclosed', 'word"quote', '\u0000'])
    assert.throws(() => provider.searchPage(query), { status: 400 });
  for (const filters of [{ unknown: 'x' }, { type: 'private-note' }, { type: ['verse'] }, { book: '../freedom' }, { book: 'unknown' },
    { chapter: 1 }, { book: 'freedom', chapter: 999 }, { page: 0 }, { page: '01' }, { page: '' }, { page: 1.5 }, { page: 10001 }, { limit: 51 }, { limit: 0 }, { page: { $gt: 0 } }])
    assert.throws(() => provider.searchPage('freedom', filters), { status: 400 }, JSON.stringify(filters));
  const one = provider.searchPage('freedom', { limit: 1 }), last = provider.searchPage('freedom', { limit: 1, page: one.pagination.pages });
  assert.equal(last.items.length, 1); assert.equal(one.pagination.pages, one.pagination.total);
  assert.deepEqual(provider.search(' '), []); assert.ok(provider.search('responsibility').every(item => item.kind === 'verse'));
});

test('database search caching is bounded, rechecks approval, expires, retries failures and never falls back to PDF', async () => {
  const data = fixture(); let now = 0, loads = 0, approved = data.edition, fail = false;
  const snapshot = { books: data.books, chapters: data.chapters, verses: data.verses, notes: data.notes,
    glossary: data.glossary, crossReferences: data.crossReferences, crossReferenceIndex: data.index };
  const search = createDatabaseSearch({ getEdition: async () => approved, now: () => now, loadSnapshot: async () => {
    loads++; if (fail) throw new Error('Synthetic unavailable snapshot'); return snapshot;
  } });
  await Promise.all([search('synthetic'), search('quotation')]); assert.equal(loads, 1);
  now = 30000; await search('synthetic'); assert.equal(loads, 2);
  approved = null; await assert.rejects(search('synthetic'), { status: 503 });
  approved = data.edition; fail = true; await assert.rejects(search('synthetic'), { status: 503 });
  fail = false; await search('synthetic'); assert.equal(loads, 4);
  await assert.rejects(search('', { page: 0 }), { status: 400 }); assert.equal(loads, 4);
});

test('mounted PDF search stays anonymous, returns compatible arrays with real totals and enforces validation, limits and explicit unavailable responses', async t => {
  const models = ['User', 'PrivateNote', 'Bookmark', 'ReadingProgress', 'ReadingHistory', 'Book', 'Verse'];
  for (const name of models) t.mock.method(require('../src/models/' + name), 'find', () => { throw new Error('Search must not query private/DB models in PDF mode'); });
  app.set('trust proxy', 1);
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  let sequence = 0;
  const get = async (query, ip) => {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/search${query}`, { signal: AbortSignal.timeout(20000), headers: { 'X-Forwarded-For': ip ?? `198.51.100.${++sequence % 250 + 1}` } });
    return { status: result.status, body: await result.json(), headers: result.headers };
  };
  try {
    const legacy = await get('?q=Purpose%203%3A29'); assert.equal(legacy.status, 200); assert.equal(legacy.body.data[0].verse.canonicalId, 'purpose:3:29');
    assert.equal(legacy.body.count, legacy.body.data.length); assert.ok(legacy.body.pagination.total >= legacy.body.count);
    const glossary = await get('?q=Abstinence&type=glossary&book=relationships&limit=1'); assert.equal(glossary.body.pagination.total, 1);
    assert.equal(glossary.body.data[0].entry.definition, manuscript.glossary[0].definition);
    for (const query of ['', '?q=', '?q=%20', '?q=x&q=y', '?q[$ne]=x', '?q=' + 'x'.repeat(201), '?q=freedom&userId=x',
      '?q=freedom&type=private-note', '?q=freedom&page=0', '?q=freedom&limit=51', '?q=freedom&book[$ne]=x']) assert.equal((await get(query)).status, 400, query);
    for (let i = 0; i < 120; i++) assert.equal((await get('?q=Purpose%203%3A29', '192.0.2.100')).status, 200);
    const limited = await get('?q=Purpose%203%3A29', '192.0.2.100'); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
    t.mock.method(content, 'searchPage', async () => { throw Object.assign(new Error('This content source does not support search.'), { status: 501 }); });
    const unavailable = await get('?q=freedom'); assert.equal(unavailable.status, 501); assert.equal(unavailable.body.message, 'This content source does not support search.');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
