/** Public content contracts. Slugs and verse addresses do not expose database IDs. */
export interface Book {
  slug: string;
  title: string;
  order: number;
  numberLabel: string;
  chapterCount: number;
  subtitle: string;
  description: string;
}

export interface Chapter {
  bookSlug: string;
  number: number;
  /** Excerpts must never be presented as complete chapters. */
  completeness: 'excerpt' | 'complete';
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
  text: string;
  commentary: Commentary | null;
}

export interface ChapterContent {
  book: Book;
  chapter: Chapter;
  verses: Verse[];
}
