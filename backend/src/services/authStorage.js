const mongoose = require('mongoose');
const User = require('../models/User');
const RefreshSession = require('../models/RefreshSession');
const PasswordResetToken = require('../models/PasswordResetToken');
const EmailVerificationToken = require('../models/EmailVerificationToken');
const Bookmark = require('../models/Bookmark');
const PrivateNote = require('../models/PrivateNote');
const ReadingProgress = require('../models/ReadingProgress');
const ReadingHistory = require('../models/ReadingHistory');
const { failure } = require('../config/auth');
async function assertAuthStorage() {
  if (mongoose.connection.readyState !== 1) throw failure();
  try {
    const [users, sessions] = await Promise.all([User.collection.indexes(), RefreshSession.collection.indexes()]);
    if (!users.some(index => index.name === 'user_email_unique' && index.unique && !index.sparse && !index.partialFilterExpression && index.key.email === 1 &&
        Object.keys(index.key).length === 1 && index.collation?.locale === 'en' && index.collation?.strength === 2 && index.collation?.caseLevel === false) ||
        !sessions.some(index => index.name === 'refresh_token_hash_unique' && index.unique && !index.sparse && !index.partialFilterExpression && index.key.tokenHash === 1 && Object.keys(index.key).length === 1) ||
        !sessions.some(index => index.name === 'refresh_session_expiry' && index.key.expiresAt === 1 && index.expireAfterSeconds === 0)) throw failure();
  } catch { throw failure(); }
}
async function initializeAuthStorage() {
  for (const model of [User, RefreshSession, PasswordResetToken, EmailVerificationToken, Bookmark, PrivateNote, ReadingProgress, ReadingHistory]) { await model.createCollection(); await model.createIndexes(); }
  await assertAuthStorage();
  await require('./personalStorage').assertPersonalStorage();
  await require('./readingStorage').assertReadingStorage();
}
module.exports = { assertAuthStorage, initializeAuthStorage };
