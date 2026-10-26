const auth = require("../services/auth.service");
const { revokeSession } = require("../services/session.service");
const { refreshCookie } = require("../middleware/auth.middleware");
const respond = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};
module.exports = {
  register: respond(async (req, res) =>
    res
      .status(201)
      .json({ success: true, data: { user: await auth.register(req.body) } }),
  ),

  login: respond(async (req, res) => {
    const { refreshToken, ...data } = await auth.login(
      req.body,
      req.authConfig,
    );
    res.cookie(req.authConfig.cookieName, refreshToken, {
      ...req.authConfig.cookieOptions,
      maxAge: req.authConfig.refreshTtlMs,
    });
    res.json({ success: true, data });
  }),

  logout: respond(async (req, res) => {
    await revokeSession(refreshCookie(req));
    res.clearCookie(req.authConfig.cookieName, req.authConfig.cookieOptions);
    res.json({ success: true, data: { message: "Logged out." } });
  }),
  me: respond(async (req, res) =>
    res.json({ success: true, data: { user: auth.safeUser(req.auth.user) } }),
  ),
};
