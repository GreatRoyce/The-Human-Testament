const express = require('express');
const { authReady, authenticate, protectMutation, requireVerifiedEmail, createAuthRateLimiter } = require('../middleware/auth.middleware');
const { assertCommunityStorage } = require('../services/communityStorage');
const service = require('../services/community.service');
const writeGate = require('../middleware/communityPosting.middleware');
const router = express.Router();
router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try { await assertCommunityStorage(); next(); } catch (error) { next(error); }
});
router.use(createAuthRateLimiter({ limit: 180 }));
// An invalid supplied credential fails closed; it never falls back to anonymous.
router.use((req, res, next) => {
  if (req.method !== 'GET' || req.get('Authorization') !== undefined) return authReady(req, res, error => error ? next(error) : authenticate(req, res, next));
  next();
});
const noWriteQuery = (req, res, next) => Object.keys(req.query).length ? next(Object.assign(new Error('Invalid community input.'), { status: 400 })) : next();
const secured = [protectMutation, requireVerifiedEmail, noWriteQuery];
const writes = [...secured, writeGate];
const limited = limit => [createAuthRateLimiter({ limit: limit * 3 }), createAuthRateLimiter({ limit, key: req => String(req.auth.user._id) })];
const actor = req => req.auth?.user;
const route = (work, status = 200) => async (req, res, next) => {
  try { const data = await work(req); res.status(status).json({ success: true, data }); } catch (error) { next(error); }
};
router.get('/discussions', route(req => service.listDiscussions(req.query, actor(req))));
router.post('/discussions', ...writes, ...limited(20), route(async req => ({ item: await service.createDiscussion(req.body, actor(req)) }), 201));
router.get('/discussions/:id', route(async req => ({ item: await service.getDiscussion(req.params.id, actor(req)) })));
router.patch('/discussions/:id', ...writes, ...limited(40), route(async req => ({ item: await service.changeDiscussion(req.params.id, req.body, actor(req)) })));
router.delete('/discussions/:id', ...secured, ...limited(40), route(req => service.changeDiscussion(req.params.id, req.body, actor(req), true)));
router.get('/discussions/:id/comments', route(req => service.listComments(req.params.id, req.query, actor(req))));
router.post('/discussions/:id/comments', ...writes, ...limited(40), route(async req => ({ item: await service.createComment(req.params.id, req.body, actor(req)) }), 201));
router.patch('/comments/:id', ...writes, ...limited(60), route(async req => ({ item: await service.changeComment(req.params.id, req.body, actor(req)) })));
router.delete('/comments/:id', ...secured, ...limited(60), route(req => service.changeComment(req.params.id, req.body, actor(req), true)));
router.get('/reading-circles', route(req => service.listCircles(req.query, actor(req))));
router.post('/reading-circles', ...writes, ...limited(5), route(async req => ({ item: await service.createCircle(req.body, actor(req)) }), 201));
router.get('/reading-circles/:id', route(async req => ({ item: await service.getCircle(req.params.id, actor(req)) })));
router.patch('/reading-circles/:id', ...writes, ...limited(30), route(async req => ({ item: await service.changeCircle(req.params.id, req.body, actor(req)) })));
router.post('/reading-circles/:id/join', ...writes, ...limited(20), route(req => service.joinCircle(req.params.id, req.body, actor(req))));
router.post('/reading-circles/:id/leave', ...secured, ...limited(20), route(req => service.leaveCircle(req.params.id, req.body, actor(req))));
router.get('/reading-circles/:id/members', route(req => service.members(req.params.id, req.query, actor(req))));
router.patch('/reading-circles/:id/members/:userId', ...writes, ...limited(40), route(req => service.manageMember(req.params.id, req.params.userId, req.body, actor(req))));
router.post('/reports', ...writes, ...limited(10), route(req => service.report(req.body, actor(req)), 201));
router.get('/moderation/capabilities', route(async req => ({ globalModerator: Boolean(actor(req)?.emailVerified && await service.globalModerator(actor(req))) })));
router.get('/moderation/reports', authReady, authenticate, requireVerifiedEmail, route(req => service.reports(req.query, actor(req))));
router.patch('/moderation/reports/:id', ...secured, ...limited(60), route(req => service.reviewReport(req.params.id, req.body, actor(req))));
router.post('/moderation/actions', ...secured, ...limited(60), route(req => service.moderate(req.body, actor(req))));
router.get('/moderation/audit', authReady, authenticate, requireVerifiedEmail, route(req => service.audit(req.query, actor(req))));
// Exact prefix mounts below prevent this router from intercepting manuscript routes.
module.exports = router;
