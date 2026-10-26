const mongoose = require('mongoose');
const User = require('../models/User');
const { createOpaqueToken } = require('../utils/tokens');
const { transactionOptions } = require('./accountStorage');
const pending = new Set();
const audit = (event, status) => console.info({ event, status });
function usableToken(tokenHash, now = new Date()) {
  return { tokenHash, usedAt: null, invalidatedAt: null, deliveryStatus: 'accepted', expiresAt: { $gt: now } };
}
async function invalidateTokens(Model, user, session, at = new Date()) {
  await Model.updateMany({ user, usedAt: null, invalidatedAt: null },
    { $set: { invalidatedAt: at } }, { session, runValidators: true });
}
async function deliver({ Model, recordId, email, token, config, path, send, event }) {
  const link = new URL(path, config.frontendOrigin);
  link.hash = new URLSearchParams({ token }).toString();
  let outcome;
  try { outcome = await send({ to: email, link: link.href, minutes: config.ttlMs / 60000 }); }
  catch { outcome = { status: 'failed' }; }
  const status = ['accepted', 'failed', 'disabled'].includes(outcome?.status) ? outcome.status : 'failed';
  await Model.updateOne({ _id: recordId, usedAt: null, invalidatedAt: null }, {
    $set: { deliveryStatus: status, ...(status === 'accepted' ? {} : { invalidatedAt: new Date() }) },
  }, { runValidators: true });
  audit(event, status);
}
async function issueAccountToken({ Model, filter, purpose, config, path, send, event }) {
  const { token, tokenHash } = createOpaqueToken(purpose);
  const recordId = new mongoose.Types.ObjectId();
  const email = await mongoose.connection.transaction(async session => {
    const user = await User.findOneAndUpdate(filter, { $inc: { __v: 1 } }, { new: true, session });
    if (!user) return null;
    const now = new Date();
    await invalidateTokens(Model, user._id, session, now);
    await Model.create([{ _id: recordId, user: user._id, tokenHash, expiresAt: new Date(now.getTime() + config.ttlMs) }], { session });
    return user.email;
  }, transactionOptions);
  if (!email) return;
  if (pending.size >= 100) {
    await Model.updateOne({ _id: recordId }, { $set: { deliveryStatus: 'failed', invalidatedAt: new Date() } }, { runValidators: true });
    audit(event, 'queue_full');
    return;
  }
  // Shared bounded queue: neither credential purpose gets a log/preview transport.
  const job = new Promise(resolve => setImmediate(resolve))
    .then(() => deliver({ Model, recordId, email, token, config, path, send, event }))
    .catch(() => audit(event, 'failed')).finally(() => pending.delete(job));
  pending.add(job);
}
async function drainDeliveries() { while (pending.size) await Promise.all([...pending]); }
module.exports = { issueAccountToken, usableToken, invalidateTokens, drainDeliveries, audit };
