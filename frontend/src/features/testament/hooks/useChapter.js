import { useCallback } from 'react';
import { useResource } from '../../../hooks/useResource.js';
import { chapterService } from '../services/chapterService.js';

export function useChapter(slug, number) {
  const load = useCallback((options) => chapterService.getChapter(slug, number, options), [slug, number]);
  return useResource(load, `chapter:${slug}:${number}`, chapterService.getInitialChapter(slug, number));
}
