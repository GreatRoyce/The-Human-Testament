const Edition = require('../models/Edition');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Verse = require('../models/Verse');
const Note = require('../models/Note');
const CrossReference = require('../models/CrossReference');
const CrossReferenceIndex = require('../models/CrossReferenceIndex');
const GlossaryEntry = require('../models/GlossaryEntry');
const ContentSection = require('../models/ContentSection');
const bookProjection = 'title slug order description subtitle chapterCount sourceVersion editionId';
const published = editionId => ({ editionId, isPublished: true });
module.exports = {
  async searchSnapshot(editionId) {
    const models = [Book, Chapter, Verse, Note, GlossaryEntry, CrossReference, CrossReferenceIndex, ContentSection];
    const collections = await Edition.db.db.listCollections({}, { nameOnly: true }).toArray();
    if (models.some(model => !collections.some(collection => collection.name === model.collection.name)))
      throw Object.assign(new Error('Published search collections are not initialized.'), { status: 503 });
    const projections = [bookProjection, 'book bookSlug number referenceCount',
      'book chapter canonicalId bookSlug chapterNumber number text status unresolved source sourceVersion editionId',
      'noteNumber bookSlug type text rawText markerText anchor inferredAnchor reviewRequired reviewReasons source crossReferenceIds',
      'term definition bookTag bookSlug sourceLines',
      'id noteNumber anchor raw targets reviewRequired sourceLine',
      'id rawSource raw anchor targets matchedNoteNumber reviewRequired sourceLines', 'kind sourceLine lines'];
    const values = await Promise.all(models.map((Model, index) => Model.find(published(editionId)).select(projections[index])
      .sort({ _id: 1 }).limit(20001).maxTimeMS(5000).lean()));
    if (values.some(items => items.length > 20000)) throw Object.assign(new Error('Published search corpus exceeds the supported in-memory size.'), { status: 503 });
    return Object.fromEntries(['books', 'chapters', 'verses', 'notes', 'glossary', 'crossReferences', 'crossReferenceIndex', 'sections'].map((key, index) => [key, values[index]]));
  },
  edition: () => Edition.findOne({ isPublished: true, approvalStatus: 'APPROVED' }).lean(),
  books: editionId => Book.find(published(editionId)).select(bookProjection).sort({ order: 1 }).lean(),
  book: (editionId, slug) => Book.findOne({ ...published(editionId), slug }).select('_id ' + bookProjection).lean(),
  chapters: (editionId, book) => Chapter.find({ ...published(editionId), book }).sort({ number: 1 }).lean(),
  chapter: (editionId, book, number) => Chapter.findOne({ ...published(editionId), book, number }).lean(),
  verses: (editionId, book, chapter) => Verse.find({ ...published(editionId), book, chapter })
    .select('canonicalId bookSlug chapterNumber number text status unresolved source sourceVersion editionId').sort({ number: 1 }).lean(),
  notes: (editionId, bookSlug, chapter) => Note.find({ ...published(editionId), 'anchor.bookSlug': bookSlug, 'anchor.chapter': chapter }).sort({ noteNumber: 1 }).lean(),
  crossReferences: (editionId, bookSlug, chapter) => CrossReference.find({ ...published(editionId),
    ...(bookSlug ? { 'anchor.bookSlug': bookSlug } : {}), ...(chapter ? { 'anchor.chapter': chapter } : {}) }).sort({ noteNumber: 1 }).lean(),
  index: editionId => CrossReferenceIndex.find(published(editionId)).sort({ sourceLines: 1 }).lean(),
  glossary: editionId => GlossaryEntry.find(published(editionId)).sort({ sourceLines: 1 }).lean(),
  sections: (editionId, filter = {}) => ContentSection.find({ ...published(editionId), ...filter }).sort({ sourceLine: 1 }).lean(),
};

