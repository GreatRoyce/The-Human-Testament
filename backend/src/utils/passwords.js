const bcrypt = require('bcryptjs');
const passwordPolicyMessage = 'Use at least 12 characters and at most 72 UTF-8 bytes, without control characters.';
function validPassword(password) {
  return typeof password === 'string' && Array.from(password).length >= 12 && /\S/u.test(password) &&
    !/[\u0000-\u001f\u007f]/.test(password) && !bcrypt.truncates(password);
}
function assertPassword(password, confirmation) {
  if (!validPassword(password)) throw Object.assign(new Error(passwordPolicyMessage), { status: 400 });
  if (confirmation !== undefined && password !== confirmation)
    throw Object.assign(new Error('Password confirmation does not match.'), { status: 400 });
}
const hashPassword = password => bcrypt.hash(password, 12);
const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
module.exports = { validPassword, assertPassword, hashPassword, verifyPassword };
