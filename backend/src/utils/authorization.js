const mongoose = require('mongoose');
const { unauthorized } = require('./tokens');

// This context comes from authenticate, never from req.body/query/headers.
// Checking its shape here also makes service helpers fail closed if a route
// accidentally omits authentication middleware.
function authenticatedUser(auth) {
  if (!auth || !mongoose.isObjectIdOrHexString(auth.sessionId) ||
      !mongoose.isObjectIdOrHexString(auth.user?._id) || auth.user.isActive !== true) throw unauthorized();
  return auth.user;
}
module.exports = { authenticatedUser };
