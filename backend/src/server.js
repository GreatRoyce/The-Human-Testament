const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { validateRuntime } = require('./config/runtime');
const { assertRuntimeReady } = require('./services/runtimeReadiness');

async function startServer() {
  // Production credentials must come from the deployment environment. A local
  // development .env must never silently fill missing production secrets.
  if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ quiet: true });
    if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('Production requires externally supplied configuration.'), { code: 'PRODUCTION_ENV_FILE_DISABLED' });
  }
  const config = validateRuntime();
  const app = require('./app');
  app.set('trust proxy', config.proxyHops);
  if (config.database) await connectDB();
  await assertRuntimeReady(config);
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(config.port, config.host, () => resolve(listener));
    listener.once('error', reject);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  console.info({ event: 'server_started' });
  let stopping = false;
  const shutdown = async signal => {
    if (stopping) return;
    stopping = true;
    console.info({ event: 'shutdown_started', signal });
    const deadline = setTimeout(() => { console.error({ event: 'shutdown_timeout' }); process.exit(1); }, 15000);
    deadline.unref();
    try {
      await Promise.all([
        new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
        require('./services/passwordRecovery.service').drainDeliveries(),
      ]);
      await mongoose.disconnect();
      clearTimeout(deadline);
      console.info({ event: 'shutdown_complete' });
    } catch { console.error({ event: 'shutdown_failed' }); process.exitCode = 1; }
  };
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown(signal));
  return server;
}
if (require.main === module) startServer().catch(async error => {
  console.error({ event: 'startup_failed', code: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'STARTUP_ERROR' });
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
module.exports = { startServer };
