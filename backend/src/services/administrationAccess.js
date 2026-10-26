const mongoose = require('mongoose');
const Grant = require('../models/AnalyticsGrant'), State = require('../models/AdministrationState'), User = require('../models/User'), Audit = require('../models/ModerationAction');
const { authenticatedUser } = require('../utils/authorization');
const { transactionOptions, supportsTransactions } = require('./accountStorage');
const { unavailable } = require('./administrationStorage');
const forbidden = () => Object.assign(new Error('An explicit administration permission is required.'), { status: 403 });
async function requireAdministrator(auth, session) {
  const user = authenticatedUser(auth);
  const grant = await Grant.findOne({ user: user._id, role: 'admin', revokedAt: null, administration: true }).session(session ?? null);
  if (!user.emailVerified || !grant || !await User.exists({ _id: user._id, isActive: true, emailVerified: true }).session(session ?? null)) throw forbidden();
  return user;
}
async function exclusive(work) {
  if (!await supportsTransactions()) throw unavailable();
  return mongoose.connection.transaction(async session => {
    if (!(await State.updateOne({ _id: 'access' }, { $inc: { revision: 1 } }, { session })).matchedCount) throw unavailable();
    return work(session);
  }, transactionOptions);
}
async function essentialCount(session) {
  const [result] = await Grant.aggregate([{ $match: { role: 'admin', administration: true, revokedAt: null } },
    { $lookup: { from: User.collection.name, localField: 'user', foreignField: '_id', as: 'account' } },
    { $match: { 'account.isActive': true, 'account.emailVerified': true } }, { $count: 'value' }]).session(session);
  return result?.value ?? 0;
}
// Operator-only permission provisioning. No HTTP route can invoke this function.
async function provision({ action, userId, actorId, operator, reason }) {
  if (!['grant', 'revoke'].includes(action) || ![userId, actorId].every(x => typeof x === 'string' && /^[a-f0-9]{24}$/.test(x)) || typeof operator !== 'string' || !operator.trim() || operator.length > 100 || typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw Object.assign(new Error('Invalid administration provisioning input.'), { status: 400 });
  return exclusive(async session => {
    if (!await User.exists({ _id: actorId, isActive: true, emailVerified: true }).session(session)) throw forbidden();
    const grant = await Grant.findOne({ user: userId, role: 'admin', revokedAt: null }).session(session);
    if (!grant || (action === 'grant' && !await User.exists({ _id: userId, isActive: true, emailVerified: true }).session(session))) throw forbidden();
    const enable = action === 'grant'; if (Boolean(grant.administration) === enable) return { changed: false };
    grant.administration = enable; await grant.save({ session });
    if (!enable && await essentialCount(session) < 1) throw Object.assign(new Error('The last active administrator cannot lose access.'), { status: 409 });
    await Audit.create([{ moderator: actorId, targetType: 'admin_permission', targetId: userId, action: enable ? 'grant_admin' : 'revoke_admin',
      previousStatus: enable ? 'disabled' : 'enabled', resultingStatus: enable ? 'enabled' : 'disabled', reason, source: 'operator', operatorLabel: operator }], { session });
    return { changed: true };
  });
}
module.exports = { requireAdministrator, exclusive, essentialCount, provision };
