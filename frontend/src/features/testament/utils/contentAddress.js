import { ApiError } from '../../../services/api/ApiError.js';

export function validateBookSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ApiError('This book address is invalid.', { code: 'INVALID_INPUT' });
  }
  return slug;
}

export function validateNumber(number) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new ApiError('Chapter and verse numbers must be positive whole numbers.', { code: 'INVALID_INPUT' });
  }
  return number;
}

export function chapterUrl(bookSlug, chapterNumber) {
  return `/testament/${encodeURIComponent(bookSlug)}/${chapterNumber}`;
}

export function verseUrl(verse) {
  return `${chapterUrl(verse.bookSlug, verse.chapterNumber)}/${verse.number}`;
}
