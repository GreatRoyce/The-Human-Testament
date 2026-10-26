const mongoose = require('mongoose');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const RefreshSession = require('../models/RefreshSession');
const { bodyFields, normalizeEmail } = require('../utils/accountInput');
const { assertPassword, hashPassword, verifyPassword } = require('../utils/passwords');
const { hashOpaqueToken, validRefreshToken } = require('../utils/tokens');
const sessions = require('./session.service');
const mail = require('./email.service');
const { getRecoveryConfig } = require('../config/passwordRecovery');
const { assertRecoveryStorage, transactionOptions } = require('./passwordRecoveryStorage');
const genericMessage = 'If an eligible account exists, we will attempt to send password reset instructions.';
const invalidLink = () => Object.assign(new Error('Invalid or expired reset link. Request a new one.'), { status: 400 });
const fail = (status, message) => Object.assign(new Error(message), { status });
const tokens = require('./accountToken.service');
const audit = status => tokens.audit('password_reset_delivery', status);

async function forgotPassword(body) {
  bodyFields(body, ['email']);
  const email = await normalizeEmail(body.email);
  try {
    const config = getRecoveryConfig();
    await assertRecoveryStorage();
    await tokens.issueAccountToken({ Model: PasswordResetToken, filter: { email, isActive: true },
      purpose: 'password-reset', config, path: '/reset-password', event: 'password_reset_delivery',
      send: input => mail.sendPasswordReset(input) });
  } catch { audit('unavailable'); }
  return { message: genericMessage };
}

async function invalidateAccountCredentials(user, passwordHash, session) {
  // Monotonic even for multiple changes in the same millisecond: old JWT pca
  // claims cannot become valid again when timestamp resolution is exhausted.
  const at = new Date(Math.max(Date.now(), (user.passwordChangedAt?.getTime() ?? 0) + 1));
  await User.updateOne({ _id: user._id }, { $set: { passwordHash, passwordChangedAt: at } }, { session, runValidators: true });
  await tokens.invalidateTokens(PasswordResetToken, user._id, session, at);
  await sessions.revokeUserSessions(user._id, { session, at });
}

async function resetPassword(body) {
  bodyFields(body, ['token', 'newPassword', 'passwordConfirmation']);
  assertPassword(body.newPassword, body.passwordConfirmation);
  if (!validRefreshToken(body.token)) throw invalidLink();
  await assertRecoveryStorage();
  const tokenHash = hashOpaqueToken(body.token, 'password-reset');
  const record = await PasswordResetToken.findOne(tokens.usableToken(tokenHash));
  if (!record) throw invalidLink();
  const passwordHash = await hashPassword(body.newPassword);
  await mongoose.connection.transaction(async session => {
    const user = await User.findOneAndUpdate({ _id: record.user, isActive: true }, { $inc: { __v: 1 } }, { new: true, session });
    if (!user) throw invalidLink();
    const now = new Date();
    const consumed = await PasswordResetToken.findOneAndUpdate({ _id: record._id, ...tokens.usableToken(tokenHash, now) },
      { $set: { usedAt: now } }, { new: true, session });
    if (!consumed) throw invalidLink();
    await invalidateAccountCredentials(user, passwordHash, session);
  }, transactionOptions);
  return { message: 'Password reset. Please log in with your new password.' };
}

async function changePassword(auth, body) {
  bodyFields(body, ['currentPassword', 'newPassword', 'passwordConfirmation']);
  assertPassword(body.newPassword, body.passwordConfirmation);
  if (!body.currentPassword || Buffer.byteLength(body.currentPassword, 'utf8') > 72)
    throw fail(400, 'Current password is incorrect.');
  await assertRecoveryStorage();
  const current = await User.findOne({ _id: auth.user._id, isActive: true }).select('+passwordHash');
  if (!current || (current.passwordChangedAt?.getTime() ?? 0) !== (auth.user.passwordChangedAt?.getTime() ?? 0))
    throw fail(401, 'Authentication required.');
  if (!await verifyPassword(body.currentPassword, current.passwordHash)) throw fail(400, 'Current password is incorrect.');
  if (await verifyPassword(body.newPassword, current.passwordHash)) throw fail(400, 'Choose a different password.');
  const passwordHash = await hashPassword(body.newPassword);
  await mongoose.connection.transaction(async session => {
    const user = await User.findOneAndUpdate({ _id: current._id, passwordHash: current.passwordHash, isActive: true },
      { $inc: { __v: 1 } }, { new: true, session }).collation({ locale: 'simple' });
    const active = await RefreshSession.findOne({ _id: auth.sessionId, user: current._id, revokedAt: null, expiresAt: { $gt: new Date() } }).session(session);
    if (!user || !active) throw fail(401, 'Authentication required.');
    await invalidateAccountCredentials(user, passwordHash, session);
  }, transactionOptions);
  return { message: 'Password changed. Please log in again.' };
}

// Test/shutdown coordination only; no public queue/token-inspection endpoint.
module.exports = { forgotPassword, resetPassword, changePassword, drainDeliveries: tokens.drainDeliveries, genericMessage };
