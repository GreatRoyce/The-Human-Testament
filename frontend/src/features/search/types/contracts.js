import { z } from 'zod';
import { verseSchema } from '../../testament/types/contracts.js';

export const searchResultsSchema = z.array(z.object({
  kind: z.literal('verse'), reference: z.string(), verse: verseSchema,
}));
