const User = require('../models/User');
const fail = (status, message) => Object.assign(new Error(message), { status });
function bodyFields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !allowed.includes(key)) ||
      allowed.some(key => typeof body[key] !== 'string')) throw fail(400, 'Invalid account input.');
}
async function normalizeEmail(email) {
  const normalized = email.trim().toLowerCase();
  const candidate = new User({ email: normalized });
  try { await candidate.validate(['email']); } catch { throw fail(400, 'A valid email address is required.'); }
  return normalized;
}
module.exports = { bodyFields, normalizeEmail };
