import { useCallback } from 'react';
import { useResource } from '../../../hooks/useResource.js';
import { searchService } from '../services/searchService.js';

export function useSearch(query) {
  const load = useCallback((options) => searchService.search(query, options), [query]);
  return useResource(load, `search:${query}`, query.trim() ? searchService.getInitialResults(query) : []);
}
