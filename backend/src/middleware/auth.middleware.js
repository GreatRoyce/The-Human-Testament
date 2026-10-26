const User = require("../models/User");
const RefreshSession = require("../models/RefreshSession");
const { getAuthConfig, failure } = require("../config/auth");
const { assertAuthStorage } = require("../services/authStorage");
const { verifyAccessToken, unauthorized } = require("../utils/tokens");
const { authenticatedUser } = require('../utils/authorization');
async function authReady(req, res, next) {
  res.set("Cache-Control", "no-store");
  try {
    req.authConfig = getAuthConfig();
    if (req.authConfig.insecureLocal &&
        (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
         !['localhost', '127.0.0.1', '::1', '[::1]'].includes(req.hostname))) throw failure();
    await assertAuthStorage();
    next();
  } catch {
    next(failure());
  }
}
function protectMutation(req, res, next) {
  const config = req.authConfig;
  if (
    !config.origins.includes(req.get("Origin")) ||
    req.get("X-CSRF-Protection") !== "1"
  )
    return next(
      Object.assign(
        new Error("Request origin or CSRF protection is invalid."),
        { status: 403 },
      ),
    );
  if (!req.is("application/json"))
    return next(
      Object.assign(new Error("Send an application/json request body."), {
        status: 415,
      }),
    );
  next();
}
function createAuthRateLimiter({
  limit,
  windowMs = 15 * 60 * 1000,
  maxKeys = 10000,
  now: clock = Date.now,
  key: bucketKey = req => req.ip,
}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = clock();
    for (const [key, value] of buckets)
      if (value.until <= now) buckets.delete(key);
    const key = bucketKey(req);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxKeys)
        return next(
          Object.assign(new Error("Too many requests. Try again later."), {
            status: 429,
          }),
        );
      bucket = { until: now + windowMs, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      res.set("Retry-After", String(Math.ceil((bucket.until - now) / 1000)));
      return next(
        Object.assign(new Error("Too many requests. Try again later."), {
          status: 429,
        }),
      );
    }
    next();
  };
}
async function authenticate(req, res, next) {
  try {
    const match = req.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_.-]+)$/);
    if (!match) throw unauthorized();
    const claims = verifyAccessToken(match[1], req.authConfig);
    const [user, session] = await Promise.all([
      User.findById(claims.sub).select('_id email displayName role emailVerified isActive passwordChangedAt').lean(),
      RefreshSession.findOne({
        _id: claims.sid,
        user: claims.sub,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }).select('_id').lean(),
    ]);
    if (
      user?.isActive !== true ||
      !session ||
      (user.passwordChangedAt?.getTime() ?? 0) !== claims.pca
    )
      throw unauthorized();
    // A projected plain object, with no credentials, internal version fields,
    // timestamps unrelated to revocation, or Mongoose document methods.
    req.auth = Object.freeze({ user: Object.freeze(user), sessionId: session._id });
    next();
  } catch (error) {
    next(
      error.status === 401
        ? error
        : Object.assign(new Error("Authentication is unavailable."), {
            status: 503,
          }),
    );
  }
}
// Compose after authenticate only on features that require email ownership.
// Public reading and existing account/password endpoints intentionally omit it.
function requireActiveAccount(req, res, next) {
  try { authenticatedUser(req.auth); next(); } catch (error) { next(error); }
}
function requireVerifiedEmail(req, res, next) {
  try {
    if (authenticatedUser(req.auth).emailVerified !== true) throw Object.assign(
      new Error('Verify your email address to use this feature.'), { status: 403 });
    next();
  } catch (error) { next(error); }
}
function requireRoles(...allowed) {
  // Only roles declared by the existing User model may ever grant access.
  // Empty, unknown or reserved role lists deny everyone, including a corrupt
  // database record containing an unsupported privileged role.
  const defined = User.schema.path('role').enumValues;
  const configured = allowed.length > 0 && allowed.every(role => defined.includes(role));
  return (req, res, next) => {
    try {
      const user = authenticatedUser(req.auth);
      if (!configured || !allowed.includes(user.role)) throw Object.assign(new Error('Forbidden.'), { status: 403 });
      next();
    } catch (error) { next(error); }
  };
}
function refreshCookie(req) {
  const matches = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(req.authConfig.cookieName + "="));
  if (matches.length !== 1) return undefined;
  return matches[0].slice(req.authConfig.cookieName.length + 1);
}
module.exports = {
  authReady,
  protectMutation,
  createAuthRateLimiter,
  authenticate,
  requireAuthenticated: requireActiveAccount,
  requireActiveAccount,
  requireRoles,
  requireVerifiedEmail,
  refreshCookie,
};
