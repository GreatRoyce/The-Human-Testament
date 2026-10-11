// Vite replaces these public values at build time. Never put secrets here.
const env = import.meta.env ?? {};

export const apiConfig = Object.freeze({
  source: env.VITE_CONTENT_SOURCE || 'mock',
  baseUrl: env.VITE_API_URL || '',
});
