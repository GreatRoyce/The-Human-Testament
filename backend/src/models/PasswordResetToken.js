const mongoose = require('mongoose');
const accountTokenSchema = require('./accountTokenSchema');
module.exports = mongoose.model('PasswordResetToken', accountTokenSchema('password_reset'));
