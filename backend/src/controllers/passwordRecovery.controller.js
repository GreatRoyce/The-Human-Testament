const recovery = require('../services/passwordRecovery.service');
const respond = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
const clearCookie = (req, res) => res.clearCookie(req.authConfig.cookieName, req.authConfig.cookieOptions);
module.exports = {
  forgotPassword: respond(async (req, res) => res.status(202).json({ success: true, data: await recovery.forgotPassword(req.body) })),
  resetPassword: respond(async (req, res) => {
    const data = await recovery.resetPassword(req.body); clearCookie(req, res); res.json({ success: true, data });
  }),
  changePassword: respond(async (req, res) => {
    const data = await recovery.changePassword(req.auth, req.body); clearCookie(req, res); res.json({ success: true, data });
  }),
};
