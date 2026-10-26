const { Router } = require('express');
const { authReady, authenticate, createAuthRateLimiter } = require('../middleware/auth.middleware');
const { analyticsConfig } = require('../config/analytics');
const { assertAnalyticsStorage } = require('../services/analyticsStorage');
const service = require('../services/analytics.service');
const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const ready = async (req, res, next) => { try { req.analyticsConfig = analyticsConfig(); await assertAnalyticsStorage(); next(); } catch (error) { next(error); } };
const optionalAuth = (req, res, next) => req.get('Authorization') ? authReady(req, res, error => error ? next(error) : authenticate(req, res, next)) : next();
router.post('/events', createAuthRateLimiter({ limit: 120, windowMs: 60000 }), ready, (req, res, next) => {
  if (!req.analyticsConfig.origins.includes(req.get('Origin')) || req.get('X-CSRF-Protection') !== '1') return next(Object.assign(new Error('Invalid analytics request origin.'), { status: 403 }));
  if (!req.is('application/json')) return next(Object.assign(new Error('Send JSON.'), { status: 415 }));
  if (Object.keys(req.query).length) return next(Object.assign(new Error('Analytics queries are not accepted.'), { status: 400 }));
  next();
}, optionalAuth, async (req, res, next) => {
  try { res.status(202).json({ success: true, data: await service.record(req.body, { auth: req.auth, userAgent: req.get('User-Agent'), privacy: req.get('DNT') === '1' || req.get('Sec-GPC') === '1' }) }); }
  catch (error) { next(error); }
});
router.use(createAuthRateLimiter({ limit: 60 }), authReady, authenticate, ready);
router.get('/capabilities', async (req, res, next) => { try {
  if (Object.keys(req.query).length) throw Object.assign(new Error('No capability query is accepted.'), { status: 400 });
  res.json({ success: true, data: await service.capabilities(req.auth) });
} catch (error) { next(error); } });
router.get('/:scope/:section', async (req, res, next) => {
  try {
    const { scope, section } = req.params;
    if (!['overview', 'trends', 'pages', 'content-types', 'referrals', 'activity', 'report'].includes(section)) return next();
    const report = await service.report(req.auth, scope, req.query);
    const key = { overview: 'metrics', 'content-types': 'contentTypes' }[section] || section;
    res.json({ success: true, data: section === 'report' ? report : { range: report.range, coverage: report.coverage, [key]: report[key] } });
  } catch (error) { next(error); }
});
module.exports = router;
