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
});
export const referenceSchema = z.object({
  bookSlug: z.string().min(1), chapterNumber: positiveInteger, verseNumber: positiveInteger,
  label: z.string(), text: z.string().optional(),
});
export const commentarySchema = z.object({
  number: positiveInteger,
  type: z.enum(['Definition', 'Clarification', 'Context', 'Reflection']),
  text: z.string(), seeAlso: referenceSchema.nullable(),
});
export const verseSchema = z.object({
  bookSlug: z.string().min(1), chapterNumber: positiveInteger, number: positiveInteger,
  text: z.string().min(1), commentary: commentarySchema.nullable(),
});
export const chapterSchema = z.object({
  bookSlug: z.string().min(1), number: positiveInteger, completeness: z.enum(['excerpt', 'complete']),
});
export const chapterContentSchema = z.object({
  book: bookSchema, chapter: chapterSchema, verses: z.array(verseSchema),
}).refine(({ book, chapter, verses }) => chapter.bookSlug === book.slug &&
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
