// Internal service: used only by trusted processes and the authorized admin
// service, which supplies its audit/permission transaction when appropriate.
const mongoose = require('mongoose');
const User = require('../models/User');
const Reset = require('../models/PasswordResetToken');
const Verification = require('../models/EmailVerificationToken');
const sessions = require('./session.service');
const { invalidateTokens } = require('./accountToken.service');
const { supportsTransactions, transactionOptions } = require('./accountStorage');
const unavailable = () => Object.assign(new Error('Account lifecycle management is unavailable.'), { status: 503 });
async function setAccountActive(userId, isActive, { session: suppliedSession } = {}) {
  if (!mongoose.isObjectIdOrHexString(userId) || typeof isActive !== 'boolean')
    throw Object.assign(new Error('Invalid account lifecycle input.'), { status: 400 });
  if (!await supportsTransactions()) throw unavailable();
  const work = async session => {
    const user = await User.findOneAndUpdate({ _id: userId },
      { $inc: { __v: 1 }, $set: { isActive } }, { new: true, session, runValidators: true });
    if (!user) throw Object.assign(new Error('Account not found.'), { status: 404 });
    // Also revoke on reactivation, so direct legacy deactivations cannot cause
    // old sessions to resume when this administrative process reactivates them.
    const at = new Date();
    await sessions.revokeUserSessions(user._id, { session, at });
    await invalidateTokens(Reset, user._id, session, at);
    await invalidateTokens(Verification, user._id, session, at);
    return { id: String(user._id), isActive: user.isActive };
  };
  if (suppliedSession) {
    if (!suppliedSession.inTransaction()) throw unavailable();
    return work(suppliedSession);
  }
  return mongoose.connection.transaction(work, transactionOptions);
}
module.exports = { setAccountActive };
