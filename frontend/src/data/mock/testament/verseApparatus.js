import { manuscriptContentProvider } from '../../../services/manuscriptContent.js';

const verse = manuscriptContentProvider.getVerse('freedom', 9, 7);
const note = verse.notes[0];
const target = verse.crossReferences[0].targets[0];
export const verseApparatus = {
  bookSlug: verse.bookSlug, chapterNumber: verse.chapterNumber, verseNumber: verse.number, text: verse.text,
  commentary: { number: note.noteNumber, type: note.type, text: note.text,
    seeAlso: { bookSlug: target.bookSlug, chapterNumber: target.chapter, verseNumber: target.verse,
      label: target.raw, text: manuscriptContentProvider.getVerse(target.bookSlug, target.chapter, target.verse).text } },
  glossary: manuscriptContentProvider.getGlossary().find(entry => entry.term === 'Self-Worth'),
};
