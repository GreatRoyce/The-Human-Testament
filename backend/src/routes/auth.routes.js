const router = require("express").Router();
const controller = require("../controllers/auth.controller");
const recovery = require('../controllers/passwordRecovery.controller');
const verification = require('../controllers/emailVerification.controller');
const { hashOpaqueToken } = require('../utils/tokens');
const {
  authReady,
  protectMutation,
  createAuthRateLimiter,
  authenticate,
} = require("../middleware/auth.middleware");
router.use(authReady);
router.post(
  "/register",
  protectMutation,
  createAuthRateLimiter({ limit: 20 }),
  controller.register,
);
router.post(
  "/login",
  protectMutation,
  createAuthRateLimiter({ limit: 10 }),
  controller.login,
);
router.post(
  "/logout",
  protectMutation,
  createAuthRateLimiter({ limit: 60 }),
  controller.logout,
);
router.get("/me", authenticate, controller.me);
router.post('/forgot-password', protectMutation,
  createAuthRateLimiter({ limit: 5 }),
  createAuthRateLimiter({ limit: 3, key: req => hashOpaqueToken(typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '', 'recovery-rate') }),
  recovery.forgotPassword);
router.post('/reset-password', protectMutation, createAuthRateLimiter({ limit: 10 }), recovery.resetPassword);
router.post('/change-password', protectMutation, createAuthRateLimiter({ limit: 5 }), authenticate, recovery.changePassword);
router.post('/verify-email', protectMutation, createAuthRateLimiter({ limit: 10 }), verification.verifyEmail);
router.post('/resend-verification', protectMutation,
  createAuthRateLimiter({ limit: 5 }),
  createAuthRateLimiter({ limit: 3, key: req => hashOpaqueToken(typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '', 'verification-rate') }),
  verification.resendVerification);
module.exports = router;
