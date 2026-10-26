import type { Verse, SupportingNote } from '../../testament/types/content';

export interface SearchResult {
  kind: 'verse';
  reference: string;
  verse: Verse;
}

interface RankedResult { id: string; reference: string; match: 'exact' | 'phrase' | 'terms'; }
export type PublicSearchResult =
  | (RankedResult & { kind: 'verse'; verse: Verse })
  | (RankedResult & { kind: 'note'; note: SupportingNote })
  | (RankedResult & { kind: 'glossary'; entry: { term: string; definition: string; bookTag: string; bookSlug: string; sourceLines: number[] } })
  | (RankedResult & { kind: 'cross-reference'; origin: 'note' | 'index'; anchorStatus: 'explicit' | 'inferred' | 'unverified';
      anchorExists: boolean; reviewRequired: boolean; entry: Record<string, unknown> });
export interface SearchPage {
  items: PublicSearchResult[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
