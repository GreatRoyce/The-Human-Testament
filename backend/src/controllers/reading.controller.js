const reading = require('../services/reading.service');
const respond = handler => async (req, res, next) => {
  try { res.json({ success: true, data: await handler(req) }); }
  catch (error) { next(error); }
};
module.exports = {
  listProgress: respond(req => reading.listProgress(req.auth, req.query)),
  getProgress: respond(req => reading.getProgress(req.auth, req.params.bookId, req.query)),
  saveProgress: respond(req => reading.saveProgress(req.auth, req.params.bookId, req.body, req.query)),
  listHistory: respond(req => reading.listHistory(req.auth, req.query)),
};
