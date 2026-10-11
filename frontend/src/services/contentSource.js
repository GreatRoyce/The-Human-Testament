import { apiConfig } from '../config/api.config.js';
import { createContentApi } from './api/contentApi.js';
import { ApiError } from './api/ApiError.js';
import { mockContentProvider } from '../data/mock/testament/provider.js';

const apiProvider = createContentApi();

export function getContentSource() {
  if (apiConfig.source === 'mock') return mockContentProvider;
  if (apiConfig.source === 'api') return apiProvider;
  throw new ApiError('VITE_CONTENT_SOURCE must be mock or api.', { code: 'CONFIGURATION_ERROR' });
}

// Service-owned synchronous seeds preserve static rendering in mock mode only.
// API mode always starts with loading; failed API requests never fall back to mocks.
export function getMockSnapshot(method, ...args) {
  if (apiConfig.source !== 'mock') return undefined;
  try { return mockContentProvider[method](...args); } catch { return undefined; }
}
