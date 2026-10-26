const { isAccountPath } = require('../config/auth');
module.exports = (err, req, res, next) => {
  const status = err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 :
    [400,401,403,404,409,413,415,429,501,503].includes(err.status) ? err.status : 500;
  if (status === 500) console.error({ name: err.name, code: err.code ?? 'INTERNAL_ERROR' });
  const message = err.type === 'encoding.unsupported' ? 'Compressed request bodies are not supported.' :
    err.type === 'entity.parse.failed' ? 'Invalid JSON request body.' : err.type === 'entity.too.large' ? 'Request body is too large.' :
    status === 500 ? 'An unexpected server error occurred.' : err.message;
  if (isAccountPath(req.path)) res.set('Cache-Control', 'no-store');
  res.status(status).json({ success: false, message });
};
