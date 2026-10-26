const users = require("../services/user.service");
const respond = (handler) => async (req, res, next) => {
  try {
    res.json({ success: true, data: { user: await handler(req) } });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  me: respond((req) => users.getProfile(req.auth, req.query)),
  updateMe: respond((req) =>
    users.updateProfile(req.auth, req.body, req.query),
  ),
};
