import { useCallback } from 'react';
import { useResource } from '../../../hooks/useResource.js';
import { bookService } from '../services/bookService.js';

export function useBooks() {
  const load = useCallback((options) => bookService.getBooks(options), []);
  return useResource(load, 'books', bookService.getInitialBooks());
}
