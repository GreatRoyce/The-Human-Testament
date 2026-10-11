import { getContentSource, getMockSnapshot } from '../../../services/contentSource.js';
import { chapterContentSchema, chaptersSchema, parseContent } from '../types/contracts.js';
import { validateBookSlug, validateNumber } from '../utils/contentAddress.js';
import { ApiError } from '../../../services/api/ApiError.js';

export const chapterService = {
  async getChapters(bookSlug, options) {
    validateBookSlug(bookSlug);
    const chapters = parseContent(chaptersSchema, await getContentSource().getChapters(bookSlug, options));
    if (chapters.some((chapter) => chapter.bookSlug !== bookSlug) || new Set(chapters.map((chapter) => chapter.number)).size !== chapters.length) {
      throw new ApiError('The chapter list contains invalid addresses.', { code: 'INVALID_RESPONSE' });
    }
    return chapters;
  },
  /** @returns {Promise<import('../types/content').ChapterContent>} */
  async getChapter(bookSlug, chapterNumber, options) {
    validateBookSlug(bookSlug); validateNumber(chapterNumber);
    const content = parseContent(chapterContentSchema, await getContentSource().getChapter(bookSlug, chapterNumber, options));
    if (content.book.slug !== bookSlug || content.chapter.number !== chapterNumber) {
      throw new ApiError('The content service returned a different chapter.', { code: 'INVALID_RESPONSE' });
    }
    return content;
  },
  getInitialChapter: (slug, number) => getMockSnapshot('getChapter', slug, number),
  getInitialChapters: (slug) => getMockSnapshot('getChapters', slug),
};
