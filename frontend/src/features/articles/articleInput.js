export function parseArticleReferences(text) {
  const lines = text.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (lines.length > 12) throw new Error('Use at most twelve manuscript references.');
  return lines.map(line => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?::[1-9]\d*){0,2}$/.test(line)) throw new Error('Use book, book:chapter or book:chapter:verse, one per line.');
    const [bookId, chapter, verse] = line.split(':');
    return { bookId, ...(chapter ? { chapterNumber: Number(chapter) } : {}), ...(verse ? { verseId: line } : {}) };
  });
}
export function formatArticleReferences(references = []) { return references.map(value => value.verseId || value.bookId + (value.chapterNumber ? ':' + value.chapterNumber : '')).join('\n'); }
export function referenceUrl(reference) { return `/testament/${reference.bookId}` + (reference.chapterNumber ? '/' + reference.chapterNumber : '') + (reference.verseId ? '/' + reference.verseId.split(':')[2] : ''); }
export function safeCoverUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash && /\.(?:png|jpe?g|webp|avif)$/i.test(url.pathname) && !/\s/u.test(value) && [...value].every(character => character.codePointAt(0) > 31 && character.codePointAt(0) !== 127) ? value : undefined; }
  catch { return undefined; }
}
