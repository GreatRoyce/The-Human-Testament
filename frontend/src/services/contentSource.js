import { apiConfig } from '../config/api.config.js';
import { createContentApi } from './api/contentApi.js';
import { ApiError } from './api/ApiError.js';
import { mockContentProvider } from '../data/mock/testament/provider.js';
import { manuscriptContentProvider } from './manuscriptContent.js';

const apiProvider = createContentApi();

export function getContentSource() {
  if (apiConfig.source === 'pdf') return manuscriptContentProvider;
  if (apiConfig.source === 'mock') return mockContentProvider;
  if (apiConfig.source === 'api') return apiProvider;
  throw new ApiError('VITE_CONTENT_SOURCE must be pdf, mock or api.', { code: 'CONFIGURATION_ERROR' });
}

// Service-owned synchronous snapshots preserve static rendering of local content.
// API mode always starts with loading; failed API requests never fall back to mocks.
export function getMockSnapshot(method, ...args) {
  if (!['pdf', 'mock'].includes(apiConfig.source)) return undefined;
  try { return getContentSource()[method](...args); } catch { return undefined; }
}
