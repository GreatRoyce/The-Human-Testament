// The selected manuscript is the default read source. MongoDB remains an
// explicit option with its existing edition/publication checks intact.
const source = process.env.CONTENT_SOURCE || 'pdf';
if (!['pdf', 'database'].includes(source)) throw new Error('CONTENT_SOURCE must be pdf or database.');
const provider = source === 'pdf'
  ? import('../../../shared/manuscript.mjs').then(({ createManuscriptProvider }) =>
    createManuscriptProvider(require('../../../shared/manuscript.json')))
  : Promise.resolve(require('./content.service'));
const methods = ['getBooks', 'getBook', 'getChapters', 'getChapter', 'getVerses', 'getVerse',
  'getSupporting', 'getVerseById', 'getCrossReferences', 'getIndex', 'getGlossary', 'getSections', 'search', 'searchPage'];
module.exports = Object.fromEntries(methods.map(method => [method, async (...args) => {
  const content = await provider;
  if (typeof content[method] !== 'function') throw Object.assign(new Error('This content source does not support search.'), { status: 501 });
  return content[method](...args);
}]));
