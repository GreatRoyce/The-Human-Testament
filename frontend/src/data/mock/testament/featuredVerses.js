import { manuscriptVerse } from '../../../services/manuscriptContent.js';

const addresses = [
  ['Inquiry', 1, 1], ['Inquiry', 1, 2], ['Inquiry', 1, 3], ['Inquiry', 1, 5], ['Inquiry', 1, 7],
  ['Inquiry', 1, 11], ['Inquiry', 1, 12], ['Inquiry', 2, 5], ['Inquiry', 2, 6],
  ['Freedom', 1, 8], ['Freedom', 1, 12], ['Freedom', 1, 16], ['Power', 18, 1],
  ['Society', 11, 6], ['Identity', 12, 8], ['Relationships', 14, 5], ['Humanity', 3, 8],
  ['Belief', 1, 12], ['Purpose', 3, 24],
];
export const featuredVerses = addresses.map(([book, chapter, verse]) => ({
  book, chapter, verse, reference: `${book} ${chapter}:${verse}`, text: manuscriptVerse(book, chapter, verse),
}));
