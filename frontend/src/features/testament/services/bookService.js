import { getContentSource, getMockSnapshot } from '../../../services/contentSource.js';
import { bookSchema, booksSchema, parseContent } from '../types/contracts.js';
import { validateBookSlug } from '../utils/contentAddress.js';
import { ApiError } from '../../../services/api/ApiError.js';

export const bookService = {
  /** @returns {Promise<import('../types/content').Book[]>} */
  async getBooks(options) { return parseContent(booksSchema, await getContentSource().getBooks(options)); },
  /** @returns {Promise<import('../types/content').Book>} */
  async getBook(slug, options) {
    validateBookSlug(slug);
    const book = parseContent(bookSchema, await getContentSource().getBook(slug, options));
    if (book.slug !== slug) throw new ApiError('The content service returned a different book.', { code: 'INVALID_RESPONSE' });
    return book;
  },
  getInitialBooks: () => getMockSnapshot('getBooks'),
  getInitialBook: (slug) => getMockSnapshot('getBook', slug),
};
