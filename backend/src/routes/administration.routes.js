const { Router } = require('express');
const { authReady, authenticate, requireVerifiedEmail, protectMutation, createAuthRateLimiter } = require('../middleware/auth.middleware');
const { assertAdministrationStorage } = require('../services/administrationStorage');
const { requireAdministrator } = require('../services/administrationAccess');
const service = require('../services/administration.service');
const router = Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const read = ['GET', 'HEAD'].includes(req.method) && /^\/(?:capabilities|overview|audit|users(?:\/[^/]+)?)\/?$/.test(req.path);
  const write = req.method === 'PATCH' && /^\/users\/[^/]+\/status\/?$/.test(req.path);
  // Unsupported administration/manuscript writes retain the existing 404
  // contract; only real administration endpoints enter the secured router.
  if (!read && !write) return next('router');
  next();
});
router.use(createAuthRateLimiter({ limit: 120 }), authReady, authenticate, requireVerifiedEmail);
router.use(async (req, res, next) => {
  try {
    if (process.env.ADMINISTRATION_ENABLED !== 'true') throw Object.assign(new Error('Administration is not enabled.'), { status: 503 });
    await assertAdministrationStorage(); await requireAdministrator(req.auth); next();
  } catch (error) { next(error); }
});
const route = work => async (req, res, next) => { try { res.json({ success: true, data: await work(req) }); } catch (error) { next(error); } };
router.get('/capabilities', route(req => { if (Object.keys(req.query).length) throw Object.assign(new Error('Invalid administration input.'), { status: 400 }); return service.capabilities(req.auth); }));
router.get('/overview', route(req => service.overview(req.auth, req.query)));
router.get('/users', route(req => service.users(req.auth, req.query)));
router.get('/users/:id', route(async req => ({ item: await service.user(req.auth, req.params.id, req.query) })));
router.patch('/users/:id/status', protectMutation, createAuthRateLimiter({ limit: 20, key: req => String(req.auth.user._id) }), route(req => service.changeAccount(req.auth, req.params.id, req.body, req.query)));
router.get('/audit', route(req => service.audit(req.auth, req.query)));
module.exports = router;
