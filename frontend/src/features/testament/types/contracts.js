import { z } from 'zod';
import { ApiError } from '../../../services/api/ApiError.js';

const positiveInteger = z.number().int().positive();
export const bookSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  order: positiveInteger,
  numberLabel: z.string(),
  chapterCount: positiveInteger,
  subtitle: z.string(),
  description: z.string(),
}).passthrough();
export const referenceSchema = z.object({
  bookSlug: z.string().min(1), chapterNumber: positiveInteger, verseNumber: positiveInteger,
  label: z.string(), text: z.string().optional(),
});
export const commentarySchema = z.object({
  number: positiveInteger,
  type: z.enum(['Definition', 'Clarification', 'Context', 'Reflection']),
  text: z.string(), seeAlso: referenceSchema.nullable(),
});
export const noteSchema = z.object({
  noteNumber: positiveInteger, type: z.enum(['Definition', 'Clarification', 'Context', 'Reflection']),
  text: z.string(), rawText: z.string(), markerText: z.string(),
  anchor: z.object({ bookSlug: z.string(), chapter: positiveInteger, verse: positiveInteger,
    status: z.enum(['explicit', 'inferred']), sourceMarkerPresent: z.boolean(), reviewRequired: z.boolean(),
  }).passthrough().refine(anchor => anchor.sourceMarkerPresent === (anchor.status === 'explicit') &&
    (anchor.status !== 'inferred' || anchor.reviewRequired), { message: 'Anchor uncertainty must be preserved.' }),
  reviewRequired: z.boolean().optional(),
}).passthrough();
export const crossReferenceSchema = z.object({
  id: z.string(), noteNumber: positiveInteger, raw: z.string(), reviewRequired: z.boolean(),
  anchor: z.object({ bookSlug: z.string(), chapter: positiveInteger, verse: positiveInteger }).passthrough(),
  targets: z.array(z.object({ raw: z.string(), status: z.enum(['resolved', 'unresolved_source_text', 'missing_reference', 'invalid_format']),
    referenceExists: z.boolean(), authoredTextExists: z.boolean(),
  }).passthrough()),
}).passthrough();
export const verseSchema = z.object({
  bookSlug: z.string().min(1), chapterNumber: positiveInteger, number: positiveInteger,
  canonicalId: z.string().optional(), status: z.enum(['authored', 'missing_source_text']).optional(),
  text: z.string().optional(), commentary: commentarySchema.nullable(), notes: z.array(noteSchema).optional(),
  crossReferences: z.array(crossReferenceSchema).optional(),
}).passthrough().refine(value => (value.status === 'missing_source_text' ? value.text === undefined :
  typeof value.text === 'string' && value.text.length > 0 && !/^\s*\[\[/m.test(value.text)) &&
  (!value.canonicalId || value.canonicalId === `${value.bookSlug}:${value.chapterNumber}:${value.number}`) &&
  [...(value.notes ?? []), ...(value.crossReferences ?? [])].every(item => item.anchor.bookSlug === value.bookSlug &&
    item.anchor.chapter === value.chapterNumber && item.anchor.verse === value.number),
{ message: 'Verse text and canonical identity must agree with source status.' });
export const chapterSchema = z.object({
  bookSlug: z.string().min(1), number: positiveInteger, completeness: z.enum(['excerpt', 'complete', 'source_incomplete']),
}).passthrough();
export const chapterContentSchema = z.object({
  book: bookSchema, chapter: chapterSchema, verses: z.array(verseSchema),
}).passthrough().refine(({ book, chapter, verses }) => chapter.bookSlug === book.slug &&
  chapter.number <= book.chapterCount &&
  verses.every((verse) => verse.bookSlug === book.slug && verse.chapterNumber === chapter.number) &&
  new Set(verses.map((verse) => verse.number)).size === verses.length,
{ message: 'Chapter and verse addresses must agree and verse numbers must be unique.' });

export const booksSchema = z.array(bookSchema);
export const chaptersSchema = z.array(chapterSchema);
export const versesSchema = z.array(verseSchema);

export function parseContent(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('The content service returned an unexpected format.', {
    code: 'INVALID_RESPONSE', details: result.error.issues,
  });
  return result.data;
}
