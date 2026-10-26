require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { initializeArticleStorage } = require('../src/services/articleStorage');
async function run() {
  try { await connectDB(); await initializeArticleStorage(); console.log('Article collections and indexes ready. No articles, users or moderator grants were seeded.'); }
  finally { await mongoose.disconnect(); }
}
if (require.main === module) run().catch(error => { console.error('Article initialization failed.', { name: error.name, code: error.code }); process.exitCode = 1; });
module.exports = { run };
