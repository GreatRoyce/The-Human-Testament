const Moderator = require('../models/CommunityModerator');
const User = require('../models/User');
// Shared by discussions and article writing/approval. No alternate role system.
module.exports = async (req, res, next) => {
  try {
    if (process.env.COMMUNITY_POSTING_ENABLED !== 'true') throw new Error();
    const grants = await Moderator.find({ revokedAt: null }).select('user').limit(100).lean();
    if (!await User.exists({ _id: { $in: grants.map(row => row.user) }, isActive: true, emailVerified: true })) throw new Error();
    next();
  } catch { next(Object.assign(new Error('Community posting is not enabled or moderation is unavailable.'), { status: 503 })); }
};
