import type { Verse } from '../../testament/types/content';

export interface SearchResult {
  kind: 'verse';
  reference: string;
  verse: Verse;
}
