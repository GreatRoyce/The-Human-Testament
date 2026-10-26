const User = require('../models/User');
const { authenticatedUser } = require('../utils/authorization');
const { bodyFields } = require('../utils/accountInput');
const { unauthorized } = require('../utils/tokens');
const projection = '_id displayName email emailVerified createdAt';
const invalidQuery = () => Object.assign(new Error('Profile query parameters are not supported.'), { status: 400 });
const invalidName = () => Object.assign(new Error('Display name must contain 1 to 80 characters without control characters.'), { status: 400 });
function profileFilter(auth, query) {
  const user = authenticatedUser(auth);
  if (!query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).length) throw invalidQuery();
  return { _id: user._id, isActive: true };
}
function safeProfile(user) {
  return { id: String(user._id), displayName: user.displayName, email: user.email,
    emailVerified: user.emailVerified, createdAt: user.createdAt };
}
async function getProfile(auth, query = {}) {
  const user = await User.findOne(profileFilter(auth, query)).select(projection).lean();
  if (!user) throw unauthorized();
  return safeProfile(user);
}
async function updateProfile(auth, body, query = {}) {
  const filter = profileFilter(auth, query);
  bodyFields(body, ['displayName']);
  // Use the User schema's setters and validators, including its trim and
  // length/control-character rules, rather than a second validation policy.
  const candidate = new User({ displayName: body.displayName });
  try { await candidate.validate(['displayName']); } catch { throw invalidName(); }
  let user;
  try {
    user = await User.findOneAndUpdate(filter, { $set: { displayName: candidate.displayName } },
      { returnDocument: 'after', runValidators: true }).select(projection).lean();
  } catch (error) {
    if (['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) throw invalidName();
    throw error;
  }
  if (!user) throw unauthorized();
  return safeProfile(user);
}
module.exports = { getProfile, updateProfile };
