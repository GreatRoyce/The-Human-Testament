const invalid = () => { throw Object.assign(new Error('Invalid moderation date range.'), { status: 400 }); };
function moderationDates(query) {
  if (query.start === undefined && query.end === undefined) return {};
  for (const key of ['start', 'end']) if (typeof query[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query[key]) || !Number.isFinite(Date.parse(query[key])) || new Date(query[key]).toISOString().slice(0, 10) !== query[key]) invalid();
  const start = new Date(query.start), end = new Date(Date.parse(query.end) + 86400000);
  if (start >= end || end - start > 366 * 86400000 || query.end > new Date().toISOString().slice(0, 10)) invalid();
  return { createdAt: { $gte: start, $lt: end } };
}
module.exports = { moderationDates };
