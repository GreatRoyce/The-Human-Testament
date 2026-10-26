const mongoose = require('mongoose');
const accountTokenSchema = require('./accountTokenSchema');
module.exports = mongoose.model('EmailVerificationToken', accountTokenSchema('email_verification'));
