const assert = require('node:assert/strict');
const pdf = require('pdf-parse/lib/pdf-parse.js');

// These are comparison operations only. They never change an ingestion string.
function comparePdfText(actual, expected, { contentsLeaders = false } = {}) {
  const compact = value => value.replace(/\s/g, '');
  const source = contentsLeaders ? actual.replace(/\.{2,}(?=\s*\d)/g, '') : actual;
  return compact(source) === compact(expected);
}

async function verifyPdfSupporting(buffer, { sections, books, bookRanges }) {
  const ranges = sections.filter(section => section.kind !== 'chapter_supporting_material').map(section => {
    const match = section.marker?.match(/source pp?\. (\d+)(?:\u2013(\d+))?/);
    assert.ok(match, 'Supporting section has no source page range.');
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    assert.ok(start > 0 && end >= start, 'Invalid supporting source page range.');
    return { section, start, end };
  });
  assert.ok(ranges.length, 'No front/back matter is available for PDF comparison.');
  const titlePages = books.map(book => {
    const range = bookRanges.find(range => range.slug === book.slug);
    const page = Number(range?.sourcePages.match(/\d+/)?.[0]);
    assert.ok(page > 0, 'Book has no source title page.');
    return { book, page };
  });
  const wanted = new Set(titlePages.map(entry => entry.page));
  for (const { start, end } of ranges) for (let page = start; page <= end; page++) wanted.add(page);
  const pages = new Map(), extractionErrors = [];
  await pdf(buffer, { pagerender: async page => {
    if (!wanted.has(page.pageNumber)) return '';
    try {
      const { items } = await page.getTextContent();
      // Running headers/page numbers are above y=600 in this manuscript.
      pages.set(page.pageNumber, items.filter(item => item.transform[5] < 600).map(item => item.str).join(''));
      return '';
    } catch (error) { extractionErrors.push({ page: page.pageNumber, message: error.message }); throw error; }
  } });
  assert.deepEqual(extractionErrors, []); // pdf-parse otherwise suppresses page failures.
  assert.ok([...wanted].every(page => pages.has(page)), 'A requested PDF page was not extracted.');
  return [
    ...ranges.map(({ section, start, end }) => {
      let source = '';
      for (let page = start; page <= end; page++) source += pages.get(page);
      const contentsLeaders = /TABLE OF CONTENTS/.test(section.marker);
      return { name: `Master PDF ${section.marker}`, sourcePages: [start, end],
        passed: comparePdfText(source, section.lines.map(line => line.raw).join('\n'), { contentsLeaders }),
        comparison: contentsLeaders ? 'Characters excluding whitespace and table-of-contents dot leaders.' : 'Characters excluding whitespace.' };
    }),
    ...titlePages.map(({ book, page }) => ({ name: `Master PDF book title/subtitle: ${book.slug}`, sourcePages: [page, page],
      passed: comparePdfText(pages.get(page), book.title + '\n' + (book.subtitle || '')),
      comparison: 'Characters excluding whitespace.' })),
  ];
}
module.exports = { verifyPdfSupporting, comparePdfText };
