const content = require('../services/readContent.service');
const respond = handler => async (req, res, next) => {
  try { const data = await handler(req); res.status(200).json({ success: true, ...(Array.isArray(data) ? { count: data.length } : {}), data }); }
  catch (error) { next(error); }
};
module.exports = {
  getBooks: respond(() => content.getBooks()),
  getBookBySlug: respond(req => content.getBook(req.params.slug)),
  getChapters: respond(req => content.getChapters(req.params.slug)),
  getChapter: respond(req => content.getChapter(req.params.slug, req.params.chapterNumber)),
  getVerses: respond(req => content.getVerses(req.params.slug, req.params.chapterNumber)),
  getVerse: respond(req => content.getVerse(req.params.slug, req.params.chapterNumber, req.params.verseNumber)),
  getSupporting: respond(req => content.getSupporting(req.params.slug, req.params.chapterNumber, req.params.verseNumber)),
  getVerseById: respond(req => content.getVerseById(req.params.canonicalId)),
  getCrossReferences: respond(() => content.getCrossReferences()),
  getIndex: respond(() => content.getIndex()),
  getGlossary: respond(() => content.getGlossary()),
  getSections: respond(req => content.getSections(req.query.kind)),
  search: async (req, res, next) => {
    try {
      if (Object.keys(req.query).some(key => !['q', 'book', 'chapter', 'type', 'page', 'limit'].includes(key)))
        throw Object.assign(new Error('Unknown search parameter.'), { status: 400 });
      const { q, ...filters } = req.query;
      const result = await content.searchPage(q, { ...filters, type: filters.type ?? 'verse' });
      res.json({ success: true, count: result.items.length, data: result.items, pagination: result.pagination });
    } catch (error) { next(error); }
  },
};
