require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Grant = require('../src/models/AnalyticsGrant');
const { assertAnalyticsGrantStorage } = require('../src/services/analyticsStorage');
async function run(args = process.argv.slice(2)) {
  const [action, role, userId, operator, reason] = args;
  if (args.length !== 5 || !['grant', 'revoke'].includes(action) || !['owner', 'admin'].includes(role) || !/^[a-f0-9]{24}$/.test(userId) || !operator?.trim() || operator.length > 100 || !reason?.trim() || reason.length > 1000) throw new Error('Usage: analytics:role -- grant|revoke owner|admin USER_ID OPERATOR REASON');
  try {
    await connectDB(); await assertAnalyticsGrantStorage();
    if (action === 'grant') {
      if (!await User.exists({ _id: userId, isActive: true, emailVerified: true })) throw new Error('An active verified account is required.');
      await Grant.create({ user: userId, role, grantedBy: operator, reason });
    } else {
      const revoke = async session => {
        const grant = await Grant.findOne({ user: userId, role, revokedAt: null }).session(session); if (!grant) throw new Error('No active grant.');
        if (grant.administration) throw new Error('Revoke administration access through admin:access before revoking this Admin grant.');
        grant.revokedAt = new Date(); grant.revokedBy = operator; grant.revocationReason = reason; await grant.save({ session });
      };
      if (role === 'admin' && await require('../src/models/AdministrationState').exists({ _id: 'access' })) await require('../src/services/administrationAccess').exclusive(revoke);
      else await revoke(null);
    }
    console.log('Analytics permission updated. User roles and community permissions were not changed.');
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Analytics provisioning failed.', { name: error.name, code: error.code, ...(error.name === 'Error' ? { message: error.message } : {}) }); process.exitCode = 1; });
module.exports = { run };
