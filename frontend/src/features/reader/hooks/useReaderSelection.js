import { useState } from 'react';

/** Client/UI state only. This is not a bookmark or saved reading progress. */
export function useReaderSelection(content, preferredNumber) {
  const [selection, setSelection] = useState(null);
  const address = content ? `${content.book.slug}/${content.chapter.number}/${preferredNumber ?? ''}` : '';
  const wanted = selection?.address === address ? selection.number : preferredNumber;
  const selectedVerse = content?.verses.find((verse) => verse.number === wanted) ?? content?.verses[0] ?? null;
  return { selectedVerse, selectVerse: (number) => setSelection({ address, number }) };
}
