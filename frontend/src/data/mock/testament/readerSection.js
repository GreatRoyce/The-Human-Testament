import { readerCopy } from '../../../features/home/content/readerCopy.js';
import { manuscriptContentProvider } from '../../../services/manuscriptContent.js';

export const readerSection = { ...readerCopy, preview: { ...readerCopy.preview, defaultVerse: '10:14',
  verses: [11, 12, 13, 14].map(number => {
    const verse = manuscriptContentProvider.getVerse('freedom', 10, number);
    const note = verse.notes[0], target = verse.crossReferences[0]?.targets[0];
    return { ref: `10:${number}`, text: verse.text, note: note ? {
      number: note.noteNumber, type: note.type, text: note.text,
      seeAlso: target ? { ref: target.raw, text: manuscriptContentProvider.getVerse(target.bookSlug, target.chapter, target.verse).text } : null,
    } : null };
  }),
} };
