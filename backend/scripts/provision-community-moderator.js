// Operator-only CLI. No account creation, passwords, or HTTP role assignment.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Moderator = require('../src/models/CommunityModerator');
const { assertCommunityStorage } = require('../src/services/communityStorage');
async function run(args = process.argv.slice(2)) {
  const [action, userId, operator, reason] = args;
  if (args.length !== 4 || !['grant', 'revoke'].includes(action) || !/^[a-f0-9]{24}$/.test(userId) || !operator?.trim() || operator.length > 100 || !reason?.trim() || reason.length > 1000) throw new Error('Usage: node scripts/provision-community-moderator.js grant|revoke USER_ID OPERATOR REASON');
  try {
    await connectDB(); await assertCommunityStorage();
    if (action === 'grant') {
      const user = await User.findOne({ _id: userId, isActive: true, emailVerified: true }); if (!user) throw new Error('An active verified account is required.');
      // A revoked grant is retained. Reinstatement requires a separately reviewed operator migration.
      await Moderator.create({ user: userId, grantedBy: operator, reason });
    } else {
      const grant = await Moderator.findOne({ user: userId, revokedAt: null }); if (!grant) throw new Error('No active grant.');
      grant.revokedAt = new Date(); grant.revokedBy = operator; grant.revocationReason = reason; await grant.save();
    }
    console.log('Moderator provisioning completed; no User role was changed.');
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Moderator provisioning failed.', { name: error.name, code: error.code, ...(error.name === 'Error' ? { message: error.message } : {}) }); process.exitCode = 1; });
module.exports = { run };
