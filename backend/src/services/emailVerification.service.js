const mongoose = require('mongoose');
const User = require('../models/User');
const Token = require('../models/EmailVerificationToken');
const { bodyFields, normalizeEmail } = require('../utils/accountInput');
const { hashOpaqueToken, validRefreshToken } = require('../utils/tokens');
const { getVerificationConfig, unavailable } = require('../config/emailVerification');
const { assertTokenStorage, transactionOptions } = require('./accountStorage');
const tokens = require('./accountToken.service');
const mail = require('./email.service');
const event = 'email_verification_delivery';
const genericMessage = 'If an eligible account exists, we will attempt to send email verification instructions.';
const invalidLink = () => Object.assign(new Error('Invalid or expired verification link. Request a new one.'), { status: 400 });
const assertVerificationStorage = () => assertTokenStorage(Token, 'email_verification', unavailable);
async function requestVerification(identity) {
  try {
    const config = getVerificationConfig();
    await assertVerificationStorage();
    await tokens.issueAccountToken({ Model: Token, filter: { ...identity, isActive: true, emailVerified: false },
      purpose: 'email-verification', config, path: '/verify-email', event,
      send: input => mail.sendEmailVerification(input) });
  } catch { tokens.audit(event, 'unavailable'); }
}
async function resendVerification(body) {
  bodyFields(body, ['email']);
  const email = await normalizeEmail(body.email);
  await requestVerification({ email });
  return { message: genericMessage };
}
async function verifyEmail(body) {
  bodyFields(body, ['token']);
  if (!validRefreshToken(body.token)) throw invalidLink();
  await assertVerificationStorage();
  const tokenHash = hashOpaqueToken(body.token, 'email-verification');
  const record = await Token.findOne(tokens.usableToken(tokenHash));
  if (!record) throw invalidLink();
  await mongoose.connection.transaction(async session => {
    // Serialize verification with replacement, deactivation and password flows.
    const user = await User.findOneAndUpdate({ _id: record.user, isActive: true, emailVerified: false },
      { $inc: { __v: 1 }, $set: { emailVerified: true } }, { new: true, session, runValidators: true });
    if (!user) throw invalidLink();
    const now = new Date();
    const consumed = await Token.findOneAndUpdate({ _id: record._id, ...tokens.usableToken(tokenHash, now) },
      { $set: { usedAt: now } }, { new: true, session });
    if (!consumed) throw invalidLink();
    await tokens.invalidateTokens(Token, user._id, session, now);
  }, transactionOptions);
  return { message: 'Email verified. You can return to your account or continue reading.' };
}
module.exports = { requestVerification, resendVerification, verifyEmail, assertVerificationStorage,
  genericMessage, drainDeliveries: tokens.drainDeliveries };
