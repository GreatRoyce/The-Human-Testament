const verification = require('../services/emailVerification.service');
const respond = (status, handler) => async (req, res, next) => {
  try { res.status(status).json({ success: true, data: await handler(req.body) }); }
  catch (error) { next(error); }
};
module.exports = { verifyEmail: respond(200, verification.verifyEmail),
  resendVerification: respond(202, verification.resendVerification) };
