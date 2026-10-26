require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { initializeCommunityStorage } = require('../src/services/communityStorage');
async function run() {
  try { await connectDB(); await initializeCommunityStorage(); console.log('Community collections and indexes ready. Posting remains controlled by COMMUNITY_POSTING_ENABLED. No accounts or moderator grants were created.'); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Community initialization failed.', { name: error.name, code: error.code }); process.exitCode = 1; });
module.exports = { run };
