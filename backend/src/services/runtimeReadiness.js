const mongoose = require('mongoose');
const { validateRuntime } = require('../config/runtime');

async function assertRuntimeReady(config = validateRuntime()) {
  if (config.database) {
    if (mongoose.connection.readyState !== 1) throw new Error('Storage unavailable.');
    await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 2000 });
  }
  if (config.auth) {
    for (const [file, method] of [
      ['authStorage', 'assertAuthStorage'], ['personalStorage', 'assertPersonalStorage'],
      ['readingStorage', 'assertReadingStorage'], ['passwordRecoveryStorage', 'assertRecoveryStorage'],
      ['emailVerification.service', 'assertVerificationStorage'], ['notificationStorage', 'assertNotificationStorage'],
    ]) await require('./' + file)[method]();
  }
  if (config.community) {
    await require('./communityStorage').assertCommunityStorage();
    await require('./articleStorage').assertArticleStorage();
  }
  if (config.analytics) await require('./analyticsStorage').assertAnalyticsStorage();
  if (config.administration) await require('./administrationStorage').assertAdministrationStorage();
  if (config.contentSource === 'database' && !(await require('./content.service').getBooks()).length) throw new Error('Published content unavailable.');
}

function createReadinessHandler(check = assertRuntimeReady, { cacheMs = 2000, timeoutMs = 5000 } = {}) {
  let cached, checkedAt = 0, pending;
  return async (req, res) => {
    if (cached === undefined || Date.now() - checkedAt >= cacheMs) {
      if (!pending) pending = (async () => {
        let timer;
        try {
          await Promise.race([Promise.resolve().then(check), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout.')), timeoutMs); })]);
          cached = true;
        } catch { cached = false; }
        finally { clearTimeout(timer); checkedAt = Date.now(); pending = undefined; }
      })();
      await pending;
    }
    res.set('Cache-Control', 'no-store').status(cached ? 200 : 503).json({ success: cached, status: cached ? 'ready' : 'unavailable', timestamp: new Date().toISOString() });
  };
}
module.exports = { assertRuntimeReady, createReadinessHandler, readinessHandler: createReadinessHandler() };
