/** Normalized frontend failure, independent of any backend or database library. */
export class ApiError extends Error {
  /** @param {string} message
   * @param {{code?: import('../../types/api').ApiErrorCode, status?: number | null, details?: unknown}} options
   */
  constructor(message, { code = 'HTTP_ERROR', status = null, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toApiError(error) {
  return error instanceof ApiError ? error : new ApiError('Unable to load content. Please try again.', {
    code: 'NETWORK_ERROR',
  });
}
