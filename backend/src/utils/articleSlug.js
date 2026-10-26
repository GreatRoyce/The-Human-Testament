const crypto = require('node:crypto');
function makeSlug(title) {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 75).replace(/^-|-$/g, '') || 'essay';
  return `${base}-${crypto.randomBytes(8).toString('hex')}`;
}
module.exports = { makeSlug };
