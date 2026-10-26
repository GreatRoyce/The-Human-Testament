require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { initializeAdministrationStorage } = require('../src/services/administrationStorage');
async function run() {
  try { await connectDB(); await initializeAdministrationStorage(); console.log('Administration access lock and shared grant/audit indexes ready. No user, permission or metric was seeded.'); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Administration initialization failed.', { name: error.name, code: error.code }); process.exitCode = 1; });
module.exports = { run };
