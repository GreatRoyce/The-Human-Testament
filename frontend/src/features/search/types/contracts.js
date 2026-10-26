import { z } from 'zod';
import { verseSchema, noteSchema } from '../../testament/types/contracts.js';

export const searchResultsSchema = z.array(z.object({
  kind: z.literal('verse'), reference: z.string(), verse: verseSchema,
}));
const base = { id: z.string().min(1), reference: z.string(), match: z.enum(['exact', 'phrase', 'terms']) };
const anchor = z.object({ bookSlug: z.string(), chapter: z.number().int().positive(), verse: z.number().int().positive() }).passthrough();
const target = z.object({ raw: z.string(), status: z.enum(['resolved', 'unresolved_source_text', 'missing_reference', 'invalid_format']),
  referenceExists: z.boolean(), authoredTextExists: z.boolean() }).passthrough();
export const searchPageSchema = z.object({ items: z.array(z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('verse'), verse: verseSchema }),
  z.object({ ...base, kind: z.literal('note'), note: noteSchema }),
  z.object({ ...base, kind: z.literal('glossary'), entry: z.object({ term: z.string(), definition: z.string(), bookSlug: z.string(), bookTag: z.string(), sourceLines: z.array(z.number().int().positive()).min(1) }).passthrough() }),
  z.object({ ...base, kind: z.literal('cross-reference'), origin: z.enum(['note', 'index']), anchorStatus: z.enum(['explicit', 'inferred', 'unverified']),
    anchorExists: z.boolean(), reviewRequired: z.boolean(), entry: z.object({ id: z.string(), raw: z.string(), anchor: anchor.nullish(),
      targets: z.array(target), sourceLine: z.number().int().positive().optional(), sourceLines: z.array(z.number().int().positive()).optional(), rawSource: z.string().optional() }).passthrough() }),
])), pagination: z.object({ page: z.number().int().positive(), limit: z.number().int().positive().max(50), total: z.number().int().nonnegative(), pages: z.number().int().nonnegative() }) });
