import { getContentSource, getMockSnapshot } from '../../../services/contentSource.js';
import { parseContent } from '../../testament/types/contracts.js';
import { searchResultsSchema, searchPageSchema } from '../types/contracts.js';
import { normalizeSearchRequest } from '../../../../../shared/search.mjs';
import { ApiError } from '../../../services/api/ApiError.js';

export const searchService = {
  async searchPage(query, filters = {}, options) {
    try { normalizeSearchRequest(query, filters); }
    catch (error) { throw new ApiError(error.message, { code: 'INVALID_INPUT', status: 400 }); }
    return parseContent(searchPageSchema, await getContentSource().searchPage(query, filters, options));
  },
  getInitialPage: (query, filters) => getMockSnapshot('searchPage', query, filters),
  /** @returns {Promise<import('../types/search').SearchResult[]>} */
  async search(query, options) {
    if (typeof query !== 'string') throw new ApiError('Enter a search query.', { code: 'INVALID_INPUT' });
    const normalized = query.trim();
    if (!normalized) return [];
    return parseContent(searchResultsSchema, await getContentSource().search(normalized, options));
  },
  getInitialResults: (query) => getMockSnapshot('search', query),
};
