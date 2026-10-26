const PasswordResetToken = require('../models/PasswordResetToken');
const { unavailable } = require('../config/passwordRecovery');
const { supportsTransactions, assertTokenStorage, transactionOptions } = require('./accountStorage');
async function assertRecoveryStorage() {
  await assertTokenStorage(PasswordResetToken, 'password_reset', unavailable);
}
module.exports = { supportsTransactions, assertRecoveryStorage, transactionOptions };
