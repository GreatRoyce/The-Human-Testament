const mongoose = require('mongoose');
const { text } = require('./communityFields');
const { isCanonicalBook, isCanonicalLocation, isCanonicalReference } = require('../utils/canonicalReference');
const categories = ['essay', 'reflection', 'analysis', 'reading-guide'];
const tagPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validReference(value) {
  return Boolean(value && isCanonicalBook(value.bookId) &&
    (value.chapterNumber === undefined || isCanonicalLocation(value.bookId, value.chapterNumber)) &&
    (value.verseId === undefined || (isCanonicalReference(value.verseId) && value.verseId.split(':')[0] === value.bookId && Number(value.verseId.split(':')[1]) === value.chapterNumber)));
}
function validCover(value) {
  if (value === '' || value === undefined) return true;
  if (typeof value !== 'string' || value.length > 2000 || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    const origins = (process.env.ARTICLE_COVER_IMAGE_ORIGINS ?? '').split(',').map(item => item.trim()).filter(Boolean);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
      /\.(?:png|jpe?g|webp|avif)$/i.test(url.pathname) && origins.includes(url.origin);
  } catch { return false; }
}
const referenceSchema = new mongoose.Schema({ bookId: { type: String, cast: false, required: true }, chapterNumber: Number,
  verseId: { type: String, cast: false } }, { _id: false, strict: 'throw', versionKey: false });
const contentFields = {
  title: { ...text(180), trim: true }, subtitle: { ...text(300, false), default: '' }, body: text(100000),
  excerpt: { ...text(600, false), default: '' }, coverImage: { type: String, cast: false, default: '', validate: { validator: validCover, message: 'Use an approved HTTPS raster image URL.' } },
  tags: { type: [{ type: String, cast: false, maxlength: 32 }], default: [], validate: { validator: values => values.length <= 8 && new Set(values).size === values.length && values.every(value => tagPattern.test(value)), message: 'Use at most eight distinct tag slugs.' } },
  category: { type: String, cast: false, enum: ['', ...categories], default: '' },
  canonicalReferences: { type: [referenceSchema], default: [], validate: { validator: values => values.length <= 12 && values.every(validReference) &&
    new Set(values.map(value => `${value.bookId}:${value.chapterNumber ?? ''}:${value.verseId ?? ''}`)).size === values.length, message: 'Use at most twelve distinct, consistent canonical references.' } },
};
module.exports = { contentFields, categories, tagPattern, validCover, validReference };
