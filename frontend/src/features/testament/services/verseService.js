import { getContentSource } from '../../../services/contentSource.js';
import { verseSchema, versesSchema, parseContent } from '../types/contracts.js';
import { validateBookSlug, validateNumber } from '../utils/contentAddress.js';
import { ApiError } from '../../../services/api/ApiError.js';

export const verseService = {
  async getVerses(bookSlug, chapterNumber, options) {
    validateBookSlug(bookSlug); validateNumber(chapterNumber);
    const verses = parseContent(versesSchema, await getContentSource().getVerses(bookSlug, chapterNumber, options));
    if (verses.some((verse) => verse.bookSlug !== bookSlug || verse.chapterNumber !== chapterNumber) ||
      new Set(verses.map((verse) => verse.number)).size !== verses.length) {
      throw new ApiError('The verse list contains invalid addresses.', { code: 'INVALID_RESPONSE' });
    }
    return verses;
  },
  /** @returns {Promise<import('../types/content').Verse>} */
  async getVerse(bookSlug, chapterNumber, verseNumber, options) {
    validateBookSlug(bookSlug); validateNumber(chapterNumber); validateNumber(verseNumber);
    const value = await getContentSource().getVerse(bookSlug, chapterNumber, verseNumber, options);
    if (value === null) throw new ApiError('This verse is not available.', { code: 'NOT_FOUND', status: 404 });
    const verse = parseContent(verseSchema, value);
    if (verse.bookSlug !== bookSlug || verse.chapterNumber !== chapterNumber || verse.number !== verseNumber) {
      throw new ApiError('The content service returned a different verse.', { code: 'INVALID_RESPONSE' });
    }
    return verse;
  },
};
