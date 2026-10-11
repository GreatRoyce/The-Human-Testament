import { apiConfig } from '../../config/api.config.js';
import { ApiError } from './ApiError.js';

export function createApiClient({ baseUrl, fetchImpl = globalThis.fetch } = {}) {
  return {
    async get(path, { query, signal } = {}) {
      if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
        throw new ApiError('Set VITE_API_URL to the backend origin before using API content.', {
          code: 'CONFIGURATION_ERROR',
        });
      }
      // baseUrl is an origin or deployment prefix; paths include /api exactly once.
      let url;
      try {
        new URL(baseUrl);
        url = new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
      } catch {
        throw new ApiError('VITE_API_URL is not a valid backend URL.', { code: 'CONFIGURATION_ERROR' });
      }
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
      let response;
      try {
        response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        throw new ApiError('The content service could not be reached. Please try again.', { code: 'NETWORK_ERROR' });
      }
      if (!response.ok) {
        throw new ApiError(response.status === 404 ? 'The requested content is not available.' : 'The content service could not complete the request.', {
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
    },
  };
}

export const apiClient = createApiClient({ baseUrl: apiConfig.baseUrl });
