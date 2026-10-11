import { useCallback } from 'react';
import { useResource } from '../../../hooks/useResource.js';
import { bookService } from '../services/bookService.js';

export function useBook(slug) {
  const load = useCallback((options) => bookService.getBook(slug, options), [slug]);
  return useResource(load, `book:${slug}`, bookService.getInitialBook(slug));
}
