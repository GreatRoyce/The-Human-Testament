export type ApiErrorCode = 'NOT_FOUND' | 'INVALID_INPUT' | 'NETWORK_ERROR' |
  'HTTP_ERROR' | 'INVALID_RESPONSE' | 'CONFIGURATION_ERROR';

export interface ApiError {
  name: 'ApiError';
  message: string;
  code: ApiErrorCode;
  status: number | null;
  details?: unknown;
}

export interface RequestOptions { signal?: AbortSignal }
