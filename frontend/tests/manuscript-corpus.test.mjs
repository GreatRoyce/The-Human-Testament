import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { manuscriptContentProvider as content } from '../src/services/manuscriptContent.js';
import { chapterContentSchema, parseContent } from '../src/features/testament/types/contracts.js';
import { featuredVerses } from '../src/data/mock/testament/featuredVerses.js';
import { dialogueCards } from '../src/data/dialogueCards.js';
import paths from '../src/data/paths.js';
import { closing } from '../src/data/closing.js';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('the complete reader corpus retains every source address, authored string, note and missing reference', async () => {
  const canonical = await readJson('../../backend/data/canonical-content.draft.json');
  const supporting = await readJson('../../backend/data/supporting-material.draft.json');
  const dataset = await readJson('../../shared/manuscript.json');
  const pdf = await readFile(new URL('../../backend/data/The-Human-Testament--Complete-Manuscript.pdf', import.meta.url));
  assert.equal(createHash('sha256').update(pdf).digest('hex'), dataset.source.sha256);
  let chapters = 0, authored = 0, missing = 0, notes = 0;
  for (const book of canonical.books) {
    assert.equal(content.getBook(book.slug).chapterCount, book.chapters.length);
    assert.equal(content.getChapters(book.slug).length, book.chapters.length);
    for (const chapter of book.chapters) {
      chapters++;
      const value = parseContent(chapterContentSchema, content.getChapter(book.slug, chapter.number));
      assert.equal(value.verses.length, chapter.referenceCount);
      for (const verse of value.verses) {
        const id = `${book.slug}:${chapter.number}:${verse.number}`;
        assert.equal(verse.canonicalId, id);
        const source = chapter.verses.find(item => item.number === verse.number);
        if (source) { authored++; assert.equal(verse.text, source.text, id); }
        else { missing++; assert.equal(verse.status, 'missing_source_text', id); assert.equal('text' in verse, false); }
        const expectedNotes = supporting.notes.filter(note => note.anchor.bookSlug === book.slug && note.anchor.chapter === chapter.number && note.anchor.verse === verse.number);
        assert.deepEqual(verse.notes, expectedNotes, id);
        notes += verse.notes.length;
        assert.ok(verse.source.pdfPage > 0 && verse.source.pdfPage <= 550, id);
      }
    }
  }
  assert.deepEqual({ chapters, authored, missing, notes }, { chapters: 230, authored: 3874, missing: 31, notes: 1470 });
  assert.deepEqual(content.getSections(), supporting.sections);
  assert.deepEqual(content.getGlossary(), supporting.glossary);
  assert.deepEqual(content.getIndex(), supporting.crossReferenceIndex);
  assert.deepEqual(content.getCrossReferences(), supporting.crossReferences);
  assert.deepEqual(closing.canonical, supporting.sections.find(section => section.marker?.includes('CLOSING TEXT')).lines.map(line => line.raw));
  const verse = content.getVerse('freedom', 9, 7);
  assert.equal(verse.source.pdfPage, 83);
  verse.notes[0].text = 'Mutated';
  assert.notEqual(content.getVerse('freedom', 9, 7).notes[0].text, 'Mutated');
});

test('homepage quotations and full-corpus search resolve to the same fixed verse addresses', () => {
  for (const verse of featuredVerses) assert.equal(verse.text, content.getVerse(verse.book.toLowerCase(), verse.chapter, verse.verse).text);
  for (const card of dialogueCards.filter(card => card.verseRef)) {
    const [, book, chapter, verse] = card.verseRef.match(/^(\w+) (\d+):(\d+)$/);
    assert.equal(card.verse, `“${content.getVerse(book.toLowerCase(), chapter, verse).text}”`);
  }
  for (const path of paths) {
    const [, book, chapter, verse] = path.verse.match(/(\w+) (\d+):(\d+)$/);
    assert.equal(path.verse, `“${content.getVerse(book.toLowerCase(), chapter, verse).text}” ${book} ${chapter}:${verse}`);
  }
  assert.equal(content.search('Purpose 3:29')[0].verse.canonicalId, 'purpose:3:29');
  assert.equal(content.search('Inquiry 31:4')[0].verse.status, 'missing_source_text');
  assert.throws(() => content.getVerse('relationships', 1, 16), { code: 'NOT_FOUND' });
});
