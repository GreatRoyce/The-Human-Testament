const library = require('../services/personalLibrary.service');
const respond = handler => async (req, res, next) => {
  try {
    const result = await handler(req);
    res.status(result.status ?? 200).json({ success: true, data: result.data });
  } catch (error) { next(error); }
};
module.exports = {
  listBookmarks: respond(async req => ({ data: await library.listBookmarks(req.auth, req.query) })),
  saveBookmark: respond(async req => {
    const { item, created } = await library.saveBookmark(req.auth, req.body, req.query);
    return { status: created ? 201 : 200, data: { item } };
  }),
  removeBookmark: respond(async req => ({ data: { item: await library.removeBookmark(req.auth, req.params.verseId, req.body, req.query) } })),
  listNotes: respond(async req => ({ data: await library.listNotes(req.auth, req.query) })),
  createNote: respond(async req => ({ status: 201, data: { item: await library.createNote(req.auth, req.body, req.query) } })),
  getNote: respond(async req => ({ data: { item: await library.getNote(req.auth, req.params.id, req.query) } })),
  updateNote: respond(async req => ({ data: { item: await library.updateNote(req.auth, req.params.id, req.body, req.query) } })),
  deleteNote: respond(async req => ({ data: { item: await library.deleteNote(req.auth, req.params.id, req.body, req.query) } })),
};
