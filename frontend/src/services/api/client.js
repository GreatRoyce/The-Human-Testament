import { apiConfig } from '../../config/api.config.js';
import { ApiError } from './ApiError.js';

export function createApiClient({ baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid request timeout.');
    async function request(method, path, { query, signal, headers, credentials, body } = {}) {
      if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
        throw new ApiError('Set VITE_API_URL to the backend origin before using API content.', {
          code: 'CONFIGURATION_ERROR',
        });
      }
      // baseUrl is an origin or deployment prefix; paths include /api exactly once.
      let url;
      try {
        const base = new URL(baseUrl);
        if (base.username || base.password || base.search || base.hash || /\/api\/?$/.test(base.pathname)) throw new Error('Invalid backend URL.');
        url = new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
      } catch {
        throw new ApiError('VITE_API_URL is not a valid backend URL.', { code: 'CONFIGURATION_ERROR' });
      }
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
      // Preserve the caller-owned cancellation contract. Requests without a
      // caller signal are also aborted when their deadline expires.
      const controller = signal ? undefined : new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new ApiError('The service took too long to respond. Please try again.', { code: 'TIMEOUT' }));
          controller?.abort();
        }, timeoutMs);
      });
      async function perform() {
      let response;
      try {
        response = await fetchImpl(url, { method, headers: { Accept: 'application/json',
          ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? { 'Content-Type': 'application/json' } : {}), ...headers }, signal: signal ?? controller.signal,
          ...(credentials ? { credentials } : {}), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        throw new ApiError('The content service could not be reached. Please try again.', { code: 'NETWORK_ERROR' });
      }
      if (!response.ok) {
        let message = response.status === 404 ? 'The requested content is not available.' : 'The content service could not complete the request.';
        if (/^\/api\/(?:auth|users|bookmarks|notes|reading-progress|reading-history|search|discussions|comments|reading-circles|reports|moderation|articles|notifications|analytics|admin)(?:\/|$)/.test(path)) {
          try { const error = await response.json(); if (error.success === false && typeof error.message === 'string') message = error.message; } catch { /* Use the safe fallback. */ }
        }
        throw new ApiError(message, {
          code: response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
          status: response.status,
        });
      }
      try {
        return await response.json();
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        throw new ApiError('The content service returned invalid JSON.', { code: 'INVALID_RESPONSE', status: response.status });
      }
      }
      try { return await Promise.race([perform(), timeout]); }
      finally { clearTimeout(timer); }
    }
  return { get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, { ...options, body: {} }) };
}

export const apiClient = createApiClient({ baseUrl: apiConfig.baseUrl });
