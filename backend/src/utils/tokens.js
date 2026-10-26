const { createHash, randomBytes, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const issuer = 'human-testament-api', audience = 'human-testament-web';
const unauthorized = () => Object.assign(new Error('Authentication required.'), { status: 401, code: 'UNAUTHORIZED' });
const hashOpaqueToken = (value, purpose = '') => createHash('sha256').update(purpose ? `${purpose}\0${value}` : value).digest('hex');
const hashRefreshToken = value => hashOpaqueToken(value);
const validRefreshToken = value => typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]+$/.test(value);
const validId = value => typeof value === 'string' && value.length === 24 && /^[a-f0-9]+$/.test(value);
function createOpaqueToken(purpose = '') { const token = randomBytes(32).toString('base64url'); return { token, tokenHash: hashOpaqueToken(token, purpose) }; }
const createRefreshToken = () => createOpaqueToken();
function issueAccessToken(user, sessionId, config) {
  return jwt.sign({ tokenUse: 'access', sid: String(sessionId), pca: user.passwordChangedAt?.getTime() ?? 0 }, config.secret,
    { algorithm: 'HS256', issuer, audience, subject: String(user._id), jwtid: randomUUID(), expiresIn: config.accessTtlSeconds });
}
function verifyAccessToken(token, config) {
  try {
    const claims = jwt.verify(token, config.secret, { algorithms: ['HS256'], issuer, audience });
    if (typeof claims !== 'object' || claims.tokenUse !== 'access' || !validId(claims.sub) ||
        !validId(claims.sid) || !Number.isSafeInteger(claims.pca) || claims.pca < 0 ||
        !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.iat) || claims.iat > Math.floor(Date.now() / 1000) + 5) throw unauthorized();
    return claims;
  } catch { throw unauthorized(); }
}
module.exports = { createRefreshToken, hashRefreshToken, validRefreshToken, createOpaqueToken, hashOpaqueToken, issueAccessToken, verifyAccessToken, unauthorized };
