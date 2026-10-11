import { useCallback } from 'react';
import { useResource } from '../../../hooks/useResource.js';
import { chapterService } from '../services/chapterService.js';

export function useChapters(slug) {
  const load = useCallback((options) => chapterService.getChapters(slug, options), [slug]);
  return useResource(load, `chapters:${slug}`, chapterService.getInitialChapters(slug));
}
