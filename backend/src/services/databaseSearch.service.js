const { isEditionApproved } = require('./contentApproval');
const unavailable = () => Object.assign(new Error('Published database search is unavailable or incomplete.'), { status: 503 });
function createDatabaseSearch({ getEdition, loadSnapshot, ready = () => true, namespace = () => '', now = Date.now }) {
  let cached;
  return async (query, filters) => {
    const { normalizeSearchRequest, createPublicSearch } = await import('../../../shared/search.mjs');
    normalizeSearchRequest(query, filters);
    if (!ready()) throw unavailable();
    let edition;
    try { edition = await getEdition(); } catch { cached = undefined; throw unavailable(); }
    if (!isEditionApproved(edition)) { cached = undefined; throw unavailable(); }
    const key = `${namespace()}:${edition.editionId}:${edition.datasetSha256}:${edition.sourceVersion}`;
    if (!cached || cached.key !== key || now() - cached.at >= 30000) {
      const current = { key, at: now() };
      current.index = Promise.resolve().then(() => loadSnapshot(edition)).then(createPublicSearch);
      cached = current;
      current.index.catch(() => { if (cached === current) cached = undefined; });
    }
    let index;
    try { index = await cached.index; } catch { throw unavailable(); }
    return index.searchPage(query, filters);
  };
}
module.exports = { createDatabaseSearch };
