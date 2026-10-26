import { useEffect, useState } from 'react';
import { readingCheckpoints } from '../features/reader/utils/readingCheckpoints.js';
export function useReadingProgress(location) {
  const bookId = location?.bookId, chapterNumber = location?.chapterNumber, verseNumber = location?.verseNumber;
  const key = bookId ? `${bookId}:${chapterNumber}:${verseNumber ?? ''}` : '';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: '', attempt: 0, status: 'waiting' });
  useEffect(() => {
    if (!bookId) return;
    return readingCheckpoints.schedule({ bookId, chapterNumber, verseNumber }, {
      retry: attempt > 0,
      onStart: () => setState({ key, attempt, status: 'saving' }),
      onSuccess: item => setState({ key, attempt, status: 'saved', item }),
      onError: error => setState({ key, attempt, status: 'error', error }),
    });
  }, [bookId, chapterNumber, verseNumber, key, attempt]);
  const current = state.key === key && state.attempt === attempt ? state : { status: 'waiting' };
  return { ...current, retry: () => setAttempt(value => value + 1) };
}
