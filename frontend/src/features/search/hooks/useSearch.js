import { useCallback, useMemo } from 'react';
import { useResource } from '../../../hooks/useResource.js';
import { searchService } from '../services/searchService.js';

export function useSearch(query, { book, chapter, type = 'all', page = '1', limit = '20' } = {}) {
  const load = useCallback(options => searchService.searchPage(query, { book, chapter, type, page, limit }, options), [query, book, chapter, type, page, limit]);
  const initial = useMemo(() => query.trim() ? searchService.getInitialPage(query, { book, chapter, type, page, limit }) : undefined,
    [query, book, chapter, type, page, limit]);
  return useResource(load, `search:${JSON.stringify([query, book, chapter, type, page, limit])}`,
    initial);
}
