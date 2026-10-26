const { createAuthRateLimiter } = require('./auth.middleware');
// Independent public-search budget; no authentication or personal tracking.
module.exports = createAuthRateLimiter({ limit: 120 });
