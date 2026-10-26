require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { analyticsConfig } = require('../src/config/analytics');
const { initializeAnalyticsStorage } = require('../src/services/analyticsStorage');
const Event = require('../src/models/AnalyticsEvent');
async function run() {
  try {
    const config = analyticsConfig(false); await connectDB(); await initializeAnalyticsStorage();
    // Retention reductions also apply to already stored events; increases never extend their original expiry.
    await Event.collection.updateMany({}, [{ $set: { expiresAt: { $min: ['$expiresAt', { $dateAdd: { startDate: '$occurredAt', unit: 'day', amount: config.retentionDays } }] } } }]);
    console.log('Analytics collections and indexes ready. No visits or accounts were seeded.');
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Analytics initialization failed.', { name: error.name, code: error.code }); process.exitCode = 1; });
module.exports = { run };
