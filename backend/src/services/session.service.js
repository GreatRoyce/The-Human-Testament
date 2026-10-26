const mongoose = require('mongoose');
const RefreshSession = require('../models/RefreshSession');
const User = require('../models/User');
const { supportsTransactions, transactionOptions } = require('./accountStorage');
const { createRefreshToken, hashRefreshToken, validRefreshToken, issueAccessToken } = require('../utils/tokens');
async function createSession(user, config) {
  const id = new mongoose.Types.ObjectId();
  const { token, tokenHash } = createRefreshToken();
  let accessToken;
  const create = async session => {
    // Serialize replica-set logins with credential changes on the same account.
    // Standalone databases retain core login, but cannot run recovery mutations.
    let current = user;
    if (session) {
      current = await User.findOneAndUpdate({ _id: user._id, passwordHash: user.passwordHash, isActive: true },
        { $inc: { __v: 1 } }, { new: true, session, runValidators: true }).collation({ locale: 'simple' });
      if (!current) throw Object.assign(new Error('Invalid email or password.'), { status: 401 });
    }
    accessToken = issueAccessToken(current, id, config);
    await RefreshSession.create([{ _id: id, user: current._id, tokenHash, expiresAt: new Date(Date.now() + config.refreshTtlMs) }], { session });
  };
  if (await supportsTransactions()) await mongoose.connection.transaction(create, transactionOptions);
  else await create(null);
  return { refreshToken: token, accessToken, expiresIn: config.accessTtlSeconds };
}
async function revokeSession(token) {
  if (!validRefreshToken(token)) return;
  await RefreshSession.updateOne({ tokenHash: hashRefreshToken(token), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } }, { runValidators: true });
}
async function revokeUserSessions(user, { session, at = new Date() } = {}) {
  await RefreshSession.updateMany({ user, revokedAt: null }, { $set: { revokedAt: at } }, { session, runValidators: true });
}
module.exports = { createSession, revokeSession, revokeUserSessions };
