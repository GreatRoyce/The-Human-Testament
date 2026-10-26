require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { assertAdministrationStorage } = require('../src/services/administrationStorage');
const { provision } = require('../src/services/administrationAccess');
async function run(args = process.argv.slice(2)) {
  const [action, userId, actorId, operator, reason] = args;
  if (args.length !== 5) throw new Error('Usage: admin:access -- grant|revoke TARGET_USER_ID ACTOR_USER_ID OPERATOR_LABEL REASON');
  try { await connectDB(); await assertAdministrationStorage(); const result = await provision({ action, userId, actorId, operator, reason }); console.log(result.changed ? 'Administration permission updated and audited.' : 'Administration permission already has this state.'); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Administration provisioning failed.', { name: error.name, code: error.code, ...(error.status ? { message: error.message } : {}) }); process.exitCode = 1; });
module.exports = { run };
