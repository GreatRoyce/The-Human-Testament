require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { initializeNotificationStorage } = require('../src/services/notificationStorage');
async function run() {
  try { await connectDB(); await initializeNotificationStorage(); console.log('Notification collection and indexes ready. No notification, user or email was seeded.'); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Notification initialization failed.', { name: error.name, code: error.code }); process.exitCode = 1; });
module.exports = { run };
