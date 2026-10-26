import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createContentApi } from '../src/services/api/contentApi.js';
import { chapterContentSchema, parseContent } from '../src/features/testament/types/contracts.js';
const { fixture, text } = createRequire(import.meta.url)('../../backend/test-fixtures/canonical.js');

test('backend envelopes retain every note, exact decoded strings, missing text and anchor uncertainty', async () => {
  const value = fixture(), book = value.books[0];
  const data = { book: { ...book, numberLabel: 'I' }, chapter: { bookSlug: 'fixture', number: 1, title: '“Unchanged”—title', referenceCount: 3, completeness: 'source_incomplete' },
    verses: value.verses.filter(verse => verse.chapterNumber === 1).map(verse => ({ ...verse,
      notes: value.notes.filter(note => note.anchor.verse === verse.number),
      crossReferences: value.crossReferences.filter(reference => reference.anchor.verse === verse.number) })),
    notes: value.notes, sections: value.sections };
  const api = createContentApi({ get: async () => ({ success: true, data }) });
  const content = parseContent(chapterContentSchema, await api.getChapter('fixture', 1));
  assert.equal(content.book.editionId, book.editionId);
  assert.equal(content.book.sourceVersion, book.sourceVersion);
  assert.equal(content.chapter.title, data.chapter.title);
  assert.equal(content.chapter.referenceCount, 3);
  assert.equal(content.verses[0].text, text);
  assert.equal(content.verses[0].notes.length, 2);
  assert.equal(content.verses[0].notes[0].text, value.notes[0].text);
  assert.equal(content.verses[0].notes[0].rawText, value.notes[0].rawText);
  assert.equal(content.verses[2].text, undefined);
  assert.equal(content.verses[2].notes[0].anchor.status, 'inferred');
  assert.deepEqual(content.sections, value.sections);
  const changed = structuredClone(content); changed.verses[2].text = 'Invented';
  assert.throws(() => parseContent(chapterContentSchema, changed), { code: 'INVALID_RESPONSE' });
  changed.verses[2].text = undefined; changed.verses[2].notes[0].anchor.sourceMarkerPresent = true;
  assert.throws(() => parseContent(chapterContentSchema, changed), { code: 'INVALID_RESPONSE' });
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: Reader } = await server.ssrLoadModule('/src/features/reader/components/ChapterReader.jsx');
    const render = selectedVerse => renderToStaticMarkup(createElement(Reader, { content, selectedVerse, onSelect() {} }));
    const authored = render(content.verses[0]);
    assert.ok(authored.includes('Note 1') && authored.includes('Note 2'));
    assert.ok(authored.includes('whitespace-pre-wrap'));
    const missing = render(content.verses[2]);
    assert.ok(missing.includes('Source text is missing'));
    assert.ok(missing.includes('Anchor inferred'));
    assert.ok(!missing.includes('SYNTHETIC MISSING TEXT'));
    assert.ok(render(content.verses[1]).includes('Citation requires review'));
  } finally { await server.close(); }
});
