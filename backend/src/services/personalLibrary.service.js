const Bookmark = require('../models/Bookmark');
const PrivateNote = require('../models/PrivateNote');
const { createOwnedResourceAccess } = require('./ownedResource.service');
const { authenticatedUser } = require('../utils/authorization');
const { bodyFields } = require('../utils/accountInput');
const { requireCanonicalReference } = require('../utils/canonicalReference');
const bookmarks = createOwnedResourceAccess(Bookmark, { ownerField: 'user', createFields: ['verseId'] });
const notes = createOwnedResourceAccess(PrivateNote, { ownerField: 'user', createFields: ['verseId', 'content'], writableFields: ['content'] });
const invalid = () => Object.assign(new Error('Invalid private-library input.'), { status: 400 });
const bookmarkDTO = record => ({ id: String(record._id), verseId: record.verseId, createdAt: record.createdAt.toISOString() });
const noteDTO = record => ({ ...bookmarkDTO(record), content: record.content, updatedAt: record.updatedAt.toISOString() });
function noQuery(query) { bodyFields(query, []); }
function input(body, fields) { bodyFields(body, fields); return Object.fromEntries(fields.map(field => [field, body[field]])); }
function listOptions(auth, query) {
  const user = authenticatedUser(auth);
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      Object.keys(query).some(key => !['page', 'limit', 'verseId'].includes(key))) throw invalid();
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || Number(value) > max) throw invalid();
    return Number(value);
  };
  const page = integer(query.page, 1, 10000), limit = integer(query.limit, 20, 50);
  const filter = { user: user._id };
  if (query.verseId !== undefined) filter.verseId = requireCanonicalReference(query.verseId);
  return { filter, page, limit };
}
async function list(Model, dto, auth, query = {}) {
  const { filter, page, limit } = listOptions(auth, query);
  const [items, total] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Model.countDocuments(filter),
  ]);
  return { items: items.map(dto), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
module.exports = {
  listBookmarks: (auth, query) => list(Bookmark, bookmarkDTO, auth, query),
  listNotes: (auth, query) => list(PrivateNote, noteDTO, auth, query),
  async saveBookmark(auth, body, query = {}) {
    const user = authenticatedUser(auth); noQuery(query);
    const { verseId } = input(body, ['verseId']); requireCanonicalReference(verseId);
    try { return { item: bookmarkDTO(await bookmarks.create(auth, { verseId })), created: true }; }
    catch (error) {
      if (error.code !== 11000) throw error;
      // The database unique index arbitrates concurrent saves. A duplicate is
      // idempotent only after finding this user's existing record.
      const existing = await Bookmark.findOne({ user: user._id, verseId });
      if (!existing) throw Object.assign(new Error('Please retry saving this verse.'), { status: 503 });
      return { item: bookmarkDTO(existing), created: false };
    }
  },
  async removeBookmark(auth, verseId, body, query = {}) {
    const user = authenticatedUser(auth); noQuery(query); bodyFields(body ?? {}, []);
    requireCanonicalReference(verseId);
    const record = await Bookmark.findOneAndDelete({ user: user._id, verseId });
    if (!record) throw Object.assign(new Error('Resource not found.'), { status: 404 });
    return bookmarkDTO(record);
  },
  async createNote(auth, body, query = {}) {
    authenticatedUser(auth); noQuery(query);
    const values = input(body, ['verseId', 'content']); requireCanonicalReference(values.verseId);
    return noteDTO(await notes.create(auth, values));
  },
  async getNote(auth, id, query) { return noteDTO(await notes.findById(auth, id, query)); },
  async updateNote(auth, id, body, query) {
    authenticatedUser(auth);
    const values = input(body, ['content']);
    return noteDTO(await notes.updateById(auth, id, values, query));
  },
  async deleteNote(auth, id, body, query) {
    authenticatedUser(auth); bodyFields(body ?? {}, []);
    return noteDTO(await notes.deleteById(auth, id, query));
  },
};
