const mongoose = require('mongoose');
const ReadingProgress = require('../models/ReadingProgress');
const ReadingHistory = require('../models/ReadingHistory');
const { authenticatedUser } = require('../utils/authorization');
const { bodyFields } = require('../utils/accountInput');
const { requireCanonicalBook, requireCanonicalLocation } = require('../utils/canonicalReference');
const { supportsTransactions, transactionOptions } = require('./accountStorage');
const { unavailable } = require('./readingStorage');
const invalid = () => Object.assign(new Error('Invalid reading input.'), { status: 400 });
const conflict = () => Object.assign(new Error('Reading progress changed. Reload it before saving this location again.'), { status: 409 });
const notFound = () => Object.assign(new Error('Reading progress not found.'), { status: 404 });
const locationDTO = record => ({ bookId: record.bookId, chapterNumber: record.chapterNumber,
  ...(record.verseNumber !== undefined ? { verseNumber: record.verseNumber } : {}) });
const progressDTO = record => ({ ...locationDTO(record), lastReadAt: record.lastReadAt.toISOString(), revision: record.revision,
  createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() });
const historyDTO = record => ({ id: String(record._id), ...locationDTO(record), visitedAt: record.visitedAt.toISOString(), createdAt: record.createdAt.toISOString() });
function noQuery(query) { bodyFields(query, []); }
function checkpoint(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['chapterNumber', 'verseNumber', 'expectedRevision', 'eventId'].includes(key)) ||
      !Number.isSafeInteger(body.chapterNumber) || body.chapterNumber < 1 ||
      (Object.hasOwn(body, 'verseNumber') && (!Number.isSafeInteger(body.verseNumber) || body.verseNumber < 1)) ||
      !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      typeof body.eventId !== 'string' || !ReadingHistory.eventIdPattern.test(body.eventId)) throw invalid();
  return { chapterNumber: body.chapterNumber, verseNumber: body.verseNumber, expectedRevision: body.expectedRevision, eventId: body.eventId };
}
function sameEvent(event, bookId, values) {
  return event.bookId === bookId && event.chapterNumber === values.chapterNumber && event.verseNumber === values.verseNumber &&
    event.revision === values.expectedRevision + 1;
}
async function replay(user, bookId, values, session) {
  const event = await ReadingHistory.findOne({ user, eventId: values.eventId }).session(session ?? null);
  if (!event) return null;
  if (!sameEvent(event, bookId, values)) throw conflict();
  // A replay returns the current location, even if later checkpoints exist.
  // It must never reset progress or refresh the historical visit timestamp.
  const current = await ReadingProgress.findOne({ user, bookId }).session(session ?? null);
  if (!current) throw conflict();
  return { item: progressDTO(current), replayed: true };
}
module.exports = {
  async listProgress(auth, query = {}) {
    const user = authenticatedUser(auth); noQuery(query);
    // One record per canonical book bounds this list to the existing ten books.
    const items = await ReadingProgress.find({ user: user._id }).sort({ lastReadAt: -1, _id: -1 }).lean();
    return { items: items.map(progressDTO) };
  },
  async getProgress(auth, bookId, query = {}) {
    const user = authenticatedUser(auth); noQuery(query); requireCanonicalBook(bookId);
    const record = await ReadingProgress.findOne({ user: user._id, bookId }).lean();
    if (!record) throw notFound();
    return { item: progressDTO(record) };
  },
  async saveProgress(auth, bookId, body, query = {}) {
    const user = authenticatedUser(auth); noQuery(query); requireCanonicalBook(bookId);
    const values = checkpoint(body);
    requireCanonicalLocation(bookId, values.chapterNumber, values.verseNumber);
    if (!await supportsTransactions()) throw unavailable();
    try {
      return await mongoose.connection.transaction(async session => {
        const existing = await replay(user._id, bookId, values, session);
        if (existing) return existing;
        const at = new Date();
        const update = { $set: { chapterNumber: values.chapterNumber, lastReadAt: at }, $inc: { revision: 1 } };
        if (values.verseNumber === undefined) update.$unset = { verseNumber: 1 };
        else update.$set.verseNumber = values.verseNumber;
        const record = await ReadingProgress.findOneAndUpdate({ user: user._id, bookId, revision: values.expectedRevision }, update,
          { session, upsert: values.expectedRevision === 0, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: false });
        if (!record) throw conflict();
        await ReadingHistory.create([{ user: user._id, bookId, chapterNumber: values.chapterNumber,
          ...(values.verseNumber !== undefined ? { verseNumber: values.verseNumber } : {}),
          visitedAt: at, eventId: values.eventId, revision: record.revision }], { session });
        return { item: progressDTO(record), replayed: false };
      }, transactionOptions);
    } catch (error) {
      if (error.code === 11000) {
        const existing = await replay(user._id, bookId, values);
        if (existing) return existing;
        throw conflict();
      }
      if (['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) throw invalid();
      throw error;
    }
  },
  async listHistory(auth, query = {}) {
    const user = authenticatedUser(auth);
    if (!query || typeof query !== 'object' || Array.isArray(query) ||
        Object.keys(query).some(key => !['page', 'limit', 'bookId'].includes(key))) throw invalid();
    const integer = (value, fallback, max) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || Number(value) > max) throw invalid();
      return Number(value);
    };
    const page = integer(query.page, 1, 10000), limit = integer(query.limit, 20, 50);
    const filter = { user: user._id };
    if (query.bookId !== undefined) filter.bookId = requireCanonicalBook(query.bookId);
    const [items, total] = await Promise.all([
      ReadingHistory.find(filter).sort({ visitedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ReadingHistory.countDocuments(filter),
    ]);
    return { items: items.map(historyDTO), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  },
};
