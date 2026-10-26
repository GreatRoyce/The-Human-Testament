const router = require('express').Router();
const controller = require('../controllers/user.controller');
const { authReady, authenticate, protectMutation, createAuthRateLimiter } = require('../middleware/auth.middleware');
router.use(authReady, authenticate);
router.get('/me', controller.me);
router.patch('/me', protectMutation, createAuthRateLimiter({ limit: 30 }), controller.updateMe);
module.exports = router;
