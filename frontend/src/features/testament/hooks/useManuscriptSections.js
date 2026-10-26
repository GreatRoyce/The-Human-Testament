import { useCallback } from 'react';
import { z } from 'zod';
import { getContentSource, getMockSnapshot } from '../../../services/contentSource.js';
import { parseContent } from '../types/contracts.js';
import { useResource } from '../../../hooks/useResource.js';

const sectionsSchema = z.array(z.object({
  kind: z.string(), marker: z.string().optional(), sourceLine: z.number(),
  lines: z.array(z.object({ raw: z.string() }).passthrough()),
}).passthrough());
const materials = sections => parseContent(sectionsSchema, sections).filter(section => section.kind !== 'chapter_supporting_material');
export function useManuscriptSections() {
  const load = useCallback(async options => materials(await getContentSource().getSections(undefined, options)), []);
  const initial = getMockSnapshot('getSections');
  return useResource(load, 'manuscript-sections', initial && materials(initial));
}
