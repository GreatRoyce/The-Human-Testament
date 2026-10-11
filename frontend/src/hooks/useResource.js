import { useEffect, useState } from 'react';
import { toApiError } from '../services/api/ApiError.js';

/** Small read-only resource hook. UI selection and future user data live elsewhere.
 * A key change hides old data immediately; cleanup aborts and ignores late results.
 */
export function useResource(load, key, initialData) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => ({ key, attempt: 0, data: initialData, error: null, settled: initialData !== undefined }));

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => load({ signal: controller.signal })).then(
      (data) => { if (active) setState({ key, attempt, data, error: null, settled: true }); },
      (error) => {
        if (active && !controller.signal.aborted) setState({ key, attempt, data: undefined, error: toApiError(error), settled: true });
      },
    );
    return () => { active = false; controller.abort(); };
  }, [load, key, attempt]);

  const current = state.key === key && state.attempt === attempt
    ? state : { data: initialData, error: null, settled: initialData !== undefined };
  return { data: current.data, error: current.error, loading: !current.settled,
    retry: () => setAttempt((value) => value + 1) };
}
