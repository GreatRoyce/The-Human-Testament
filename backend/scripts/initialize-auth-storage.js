require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { initializeAuthStorage } = require('../src/services/authStorage');
async function run() {
  try {
    await connectDB();
    await initializeAuthStorage();
    console.log('Account, session, recovery, verification, bookmark, private-note, reading-progress and reading-history collections and required indexes are ready. No account was seeded.');
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => {
  console.error('Account/session storage initialization failed.', { name: error.name, code: error.code ?? 'INITIALIZATION_ERROR' });
  process.exitCode = 1;
});
module.exports = { run };
