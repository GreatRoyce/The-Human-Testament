import { getContentSource, getMockSnapshot } from '../../../services/contentSource.js';
import { parseContent } from '../../testament/types/contracts.js';
import { searchResultsSchema } from '../types/contracts.js';
import { ApiError } from '../../../services/api/ApiError.js';

export const searchService = {
  /** @returns {Promise<import('../types/search').SearchResult[]>} */
  async search(query, options) {
    if (typeof query !== 'string') throw new ApiError('Enter a search query.', { code: 'INVALID_INPUT' });
    const normalized = query.trim();
    if (!normalized) return [];
    return parseContent(searchResultsSchema, await getContentSource().search(normalized, options));
  },
  getInitialResults: (query) => getMockSnapshot('search', query),
};
