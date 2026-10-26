const { isCanonicalBook, isCanonicalLocation } = require('../utils/canonicalReference');
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
function locationFields({ immutable = false } = {}) {
  return {
    bookId: { type: String, cast: false, required: true, immutable: true, validate: isCanonicalBook },
    chapterNumber: { type: Number, cast: false, required: true, immutable, validate: positiveInteger },
    verseNumber: { type: Number, cast: false, immutable, validate: { validator: value => value === undefined || positiveInteger(value) } },
  };
}
function validateLocation(schema) {
  // Document writes enforce cross-field references. Atomic progress updates
  // validate the complete location in their service before entering the query.
  schema.pre('validate', function () {
    if (!isCanonicalLocation(this.bookId, this.chapterNumber, this.verseNumber))
      this.invalidate('chapterNumber', 'Canonical reading location not found.');
  });
}
module.exports = { locationFields, validateLocation, positiveInteger };
