const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pdf = require('pdf-parse/lib/pdf-parse.js');
const { sha256, readValidationReport } = require('./ingestion/read-validation-report');
const { run: verifyFidelity } = require('./verify-content-fidelity');

const dataDir = path.join(__dirname, '../data');
const destination = path.join(__dirname, '../../shared/manuscript.json');
const sourceFiles = ['The-Human-Testament--Complete-Manuscript.pdf',
  'canonical-content.draft.json', 'supporting-material.draft.json',
  'The-Human-Testament-Ingestion-Validation-Report.md', 'ingestion-report.json'];

async function buildDataset() {
  // Publication/database approval is separate. This produces a faithful, read-only
  // representation of the PDF the author selected, without editing the candidate.
  const before = Object.fromEntries(sourceFiles.map(file => [file, sha256(fs.readFileSync(path.join(dataDir, file)))]));
  const fidelity = await verifyFidelity();
  assert.ok(fidelity.passed, 'PDF fidelity verification failed; refusing to sync.');
  const read = file => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const canonical = read('canonical-content.draft.json');
  const supporting = read('supporting-material.draft.json');
  const report = read('ingestion-report.json');
  const expected = readValidationReport(fs.readFileSync(path.join(dataDir, sourceFiles[3]), 'utf8'));
  const ranges = expected.books.map(book => ({ ...book, pages: book.sourcePages.match(/\d+/g).map(Number) }));
  const referencePages = {};
  const errors = [];
  let active;
  const document = await pdf(fs.readFileSync(path.join(dataDir, sourceFiles[0])), { pagerender: async page => {
    try {
      const book = ranges.find(book => page.pageNumber >= book.pages[0] && page.pageNumber <= book.pages[1]);
      if (!book) { active = null; return ''; }
      if (active?.bookSlug !== book.slug) active = null;
      for (const item of (await page.getTextContent()).items) {
        const match = item.str.match(/^(\d+):(\d+)$/);
        if (match && Math.abs(item.height - 9) < 0.1) {
          const id = `${book.slug}:${Number(match[1])}:${Number(match[2])}`;
          assert.ok(!referencePages[id], `Duplicate PDF reference: ${id}`);
          active = { bookSlug: book.slug, page: page.pageNumber, pages: [page.pageNumber] };
          referencePages[id] = active;
        } else if (active && Math.abs(item.height - 10) < 0.1 && item.transform[5] < 600 && item.str.trim()) {
          if (!active.pages.includes(page.pageNumber)) active.pages.push(page.pageNumber);
        }
      }
    } catch (error) { errors.push(error); }
    return '';
  } });
  assert.equal(errors.length, 0, errors.map(error => error.message).join('\n'));
  assert.equal(Object.keys(referencePages).length, report.counts.references);
  for (const book of canonical.books) for (const chapter of book.chapters) {
    for (let number = 1; number <= chapter.referenceCount; number++) {
      assert.ok(referencePages[`${book.slug}:${chapter.number}:${number}`], 'Missing PDF address');
    }
  }
  for (const [file, hash] of Object.entries(before)) {
    assert.equal(sha256(fs.readFileSync(path.join(dataDir, file))), hash, `Source changed during sync: ${file}`);
  }
  return {
    schemaVersion: 1,
    source: { file: sourceFiles[0], sha256: before[sourceFiles[0]], pages: document.numpages,
      comparison: 'Exact working-edition strings; verified against PDF characters excluding layout whitespace.',
      inputs: before },
    counts: report.counts,
    books: canonical.books,
    unresolvedReferences: canonical.unresolvedReferences,
    notes: supporting.notes,
    crossReferences: supporting.crossReferences,
    crossReferenceIndex: supporting.crossReferenceIndex,
    glossary: supporting.glossary,
    sections: supporting.sections,
    referencePages,
  };
}

async function run({ check = false } = {}) {
  const dataset = await buildDataset();
  const serialized = JSON.stringify(dataset) + '\n';
  if (check) assert.equal(fs.readFileSync(destination, 'utf8'), serialized, 'Bundled manuscript is stale. Run npm run content:sync in backend.');
  else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, serialized, 'utf8');
  }
  console.log(JSON.stringify({ manuscriptMatchesPdf: true, check, sourceSha256: dataset.source.sha256,
    counts: dataset.counts, output: 'shared/manuscript.json', databaseModified: false }, null, 2));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) { console.error('Only --check is supported.'); process.exitCode = 1; }
  else run({ check: args.includes('--check') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildDataset, run };
