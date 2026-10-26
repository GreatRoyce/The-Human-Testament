/** Public content contracts. Slugs and verse addresses do not expose database IDs. */
export interface Book {
  slug: string;
  title: string;
  order: number;
  numberLabel: string;
  chapterCount: number;
  subtitle: string;
  description: string;
  editionId?: string;
  sourceVersion?: string;
  sourceSha256?: string;
}

export interface Chapter {
  bookSlug: string;
  number: number;
  /** Excerpts must never be presented as complete chapters. */
  completeness: 'excerpt' | 'complete' | 'source_incomplete';
  title?: string;
  referenceCount?: number;
}

export interface Reference {
  bookSlug: string;
  chapterNumber: number;
  verseNumber: number;
  label: string;
  text?: string;
}

export interface Commentary {
  number: number;
  type: 'Definition' | 'Clarification' | 'Context' | 'Reflection';
  text: string;
  seeAlso: Reference | null;
}

export interface Verse {
  bookSlug: string;
  chapterNumber: number;
  number: number;
  canonicalId?: string;
  status?: 'authored' | 'missing_source_text';
  text?: string;
  commentary: Commentary | null;
  notes?: SupportingNote[];
  crossReferences?: CrossReference[];
  unresolved?: { reason?: string; reviewRequired?: boolean; [key: string]: unknown };
  source?: { pdfPage?: number; pdfPages?: number[]; [key: string]: unknown };
  sourceSha256?: string;
}

export interface SupportingNote {
  noteNumber: number;
  type: Commentary['type'];
  text: string;
  rawText: string;
  markerText: string;
  anchor: { bookSlug: string; chapter: number; verse: number; status: 'explicit' | 'inferred';
    sourceMarkerPresent: boolean; reviewRequired: boolean; [key: string]: unknown };
  reviewRequired?: boolean;
  [key: string]: unknown;
}

export interface CrossReference {
  id: string;
  noteNumber: number;
  raw: string;
  reviewRequired: boolean;
  anchor: { bookSlug: string; chapter: number; verse: number };
  targets: { raw: string; status: 'resolved' | 'unresolved_source_text' | 'missing_reference' | 'invalid_format';
    referenceExists: boolean; authoredTextExists: boolean; [key: string]: unknown }[];
  [key: string]: unknown;
}

export interface ChapterContent {
  book: Book;
  chapter: Chapter;
  verses: Verse[];
  notes?: SupportingNote[];
  crossReferences?: CrossReference[];
  sections?: ContentSection[];
}

export interface ContentSection {
  id: string;
  kind: 'front_matter' | 'back_matter' | 'chapter_supporting_material';
  marker?: string;
  heading?: string;
  bookSlug?: string;
  chapter?: number;
  lines: { line: number; raw: string }[];
  [key: string]: unknown;
}
