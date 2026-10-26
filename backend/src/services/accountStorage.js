const mongoose = require('mongoose');
const unavailable = () => Object.assign(new Error('Account storage is unavailable.'), { status: 503 });
async function supportsTransactions() {
  if (mongoose.connection.readyState !== 1) throw unavailable();
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  return Boolean(hello.setName || hello.msg === 'isdbgrid');
}
async function assertTokenStorage(Model, prefix, failure = unavailable) {
  try {
    if (!await supportsTransactions()) throw failure();
    const indexes = await Model.collection.indexes();
    if (!indexes.some(index => index.name === `${prefix}_hash_unique` && index.unique && !index.sparse &&
        !index.partialFilterExpression && index.key.tokenHash === 1 && Object.keys(index.key).length === 1) ||
        !indexes.some(index => index.name === `${prefix}_expiry` && index.key.expiresAt === 1 &&
          Object.keys(index.key).length === 1 && index.expireAfterSeconds === 0)) throw failure();
  } catch { throw failure(); }
}
const transactionOptions = { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000 };
module.exports = { supportsTransactions, assertTokenStorage, transactionOptions };
