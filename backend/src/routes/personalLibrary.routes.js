const { Router } = require('express');
const controller = require('../controllers/personalLibrary.controller');
const { authReady, authenticate, protectMutation, createAuthRateLimiter } = require('../middleware/auth.middleware');
const { personalReady } = require('../services/personalStorage');
function privateRouter() {
  const router = Router();
  router.use(authReady, authenticate, personalReady);
  const limitWrites = createAuthRateLimiter({ limit: 120 });
  router.use((req, res, next) => ['POST', 'PATCH', 'DELETE'].includes(req.method)
    ? protectMutation(req, res, error => error ? next(error) : limitWrites(req, res, next)) : next());
  return router;
}
const bookmarks = privateRouter();
bookmarks.get('/', controller.listBookmarks);
bookmarks.post('/', controller.saveBookmark);
bookmarks.delete('/:verseId', controller.removeBookmark);
const notes = privateRouter();
notes.get('/', controller.listNotes);
notes.post('/', controller.createNote);
notes.get('/:id', controller.getNote);
notes.patch('/:id', controller.updateNote);
notes.delete('/:id', controller.deleteNote);
module.exports = { bookmarks, notes };
