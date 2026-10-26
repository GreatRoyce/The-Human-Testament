import { verseUrl } from '../../testament/utils/contentAddress.js';
const anchorUrl = anchor => anchor ? verseUrl({ bookSlug: anchor.bookSlug, chapterNumber: anchor.chapter, number: anchor.verse }) : undefined;
export function searchResultUrl(result) {
  if (result.kind === 'verse') return verseUrl(result.verse);
  if (result.kind === 'note') return anchorUrl(result.note.anchor);
  if (result.kind === 'glossary') return `/testament/materials#source-line-${result.entry.sourceLines[0]}`;
  if (result.origin === 'index' && result.entry.sourceLines?.length) return `/testament/materials#source-line-${result.entry.sourceLines[0]}`;
  return result.anchorExists ? anchorUrl(result.entry.anchor) : undefined;
}
export function searchTargetUrl(target) {
  return target.referenceExists && typeof target.bookSlug === 'string' && Number.isSafeInteger(target.chapter) && target.chapter > 0 && Number.isSafeInteger(target.verse) && target.verse > 0 ? anchorUrl(target) : undefined;
}
