import { readingService, readingLocationSchema, sameReadingLocation } from '../../../services/reading.service.js';
import { ApiError } from '../../../services/api/ApiError.js';
// One coordinator for the reader: debounce rapid navigation, then serialize
// checkpoints across books. Cancelling an intent never assumes an in-flight
// write was rolled back. Server revisions arbitrate other devices' writes.
export function createReadingCheckpoints({ service = readingService, delay = 1000,
  schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout, eventId = () => globalThis.crypto.randomUUID() } = {}) {
  let generation = 0, timer, queue = Promise.resolve();
  return {
    schedule(location, { onStart, onSuccess, onError, retry = false } = {}) {
      const target = readingLocationSchema.parse(location);
      const current = ++generation, sessionVersion = service.sessionVersion();
      let active = true;
      if (timer !== undefined) cancel(timer);
      const isCurrent = () => active && generation === current;
      const sameSession = () => {
        if (service.sessionVersion() !== sessionVersion) throw new ApiError('Your session changed. Please open this passage again.', { status: 401 });
      };
      timer = schedule(() => {
        timer = undefined;
        queue = queue.catch(() => {}).then(async () => {
          if (!isCurrent()) return;
          try {
            sameSession(); onStart?.();
            const previous = await service.get(target.bookId);
            if (!isCurrent()) return;
            sameSession();
            // A new opening is a meaningful visit even when this book's last
            // saved coordinates match. An explicit retry can simply confirm
            // an already committed location after an ambiguous network error.
            if (retry && sameReadingLocation(previous, target)) { onSuccess?.(previous); return; }
            const result = await service.save(target.bookId, { chapterNumber: target.chapterNumber, verseNumber: target.verseNumber,
              expectedRevision: previous?.revision ?? 0, eventId: eventId() });
            if (isCurrent()) { sameSession(); onSuccess?.(result.item); }
          } catch (error) { if (isCurrent()) onError?.(error); }
        });
        return queue;
      }, delay);
      return () => {
        active = false;
        if (generation === current) { generation++; if (timer !== undefined) { cancel(timer); timer = undefined; } }
      };
    },
  };
}
export const readingCheckpoints = createReadingCheckpoints();
