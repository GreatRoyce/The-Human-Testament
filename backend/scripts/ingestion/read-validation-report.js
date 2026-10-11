const { createHash } = require('node:crypto');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const slug = (value) => value.toLowerCase();

function section(text, start, end) {
  const from = text.indexOf(start);
  const to = end ? text.indexOf(end, from + start.length) : text.length;
  if (from < 0 || to < 0) throw new Error(`Validation report section missing: ${start}`);
  return text.slice(from + start.length, to);
}

function rows(text) {
  return text.split(/\r?\n/).filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/\*\*/g, '')));
}

function address(book, chapter, verse) {
  return { bookSlug: slug(book), chapter: Number(chapter), verse: Number(verse) };
}

function parseAddress(value) {
  const match = value.match(/^([A-Za-z]+) (\d+):(\d+)$/);
  if (!match) throw new Error(`Malformed report address: ${value}`);
  return address(match[1], match[2], match[3]);
}

function readValidationReport(text) {
  const summary = new Map(rows(section(text, '## 1. Summary', '## 2.')).map(([key, value]) => [key, Number(value)]));
  const summaryKeys = {
    books: 'Books', chapters: 'Chapters', references: 'Verse references', authoredVerses: 'Verses with text',
    unresolvedReferences: 'Verse references with no text in the source', notes: 'Supporting-material notes (footnotes)',
    explicitAnchors: 'Notes linked to a verse by a footnote marker',
    inferredAnchors: 'Notes with no marker in the source (probable anchor inferred, flagged)',
    noteCrossReferences: '"See also" cross-references inside notes', indexEntries: 'Cross-Reference Index entries', glossaryEntries: 'Glossary entries',
  };
  const counts = {};
  for (const [key, label] of Object.entries(summaryKeys)) {
    const count = summary.get(label);
    if (!Number.isInteger(count)) throw new Error(`Validation report count missing: ${label}`);
    counts[key] = count;
  }
  const bookSection = section(text, '## 4. Books, chapters and verse counts', '## 5.');
  const books = rows(bookSection).filter((row) => /^\d+$/.test(row[0])).map((row) => ({
    order: Number(row[0]), title: row[1], slug: slug(row[1]), subtitle: row[2], sourcePages: row[3],
    chapters: Number(row[4]), references: Number(row[5]), unresolvedReferences: Number(row[6]), notes: Number(row[7]),
  }));
  const chapterCounts = {};
  for (const match of bookSection.matchAll(/^- \*\*([A-Z]+)\*\*: (.+)$/gm)) {
    chapterCounts[slug(match[1])] = [...match[2].matchAll(/(\d+): (\d+)/g)].map((entry) => ({ number: Number(entry[1]), references: Number(entry[2]) }));
  }
  if (books.length !== counts.books || Object.keys(chapterCounts).length !== counts.books) throw new Error('Validation report book/chapter tables are incomplete.');

  const emptyReferences = rows(section(text, '### 6.1', '### 6.2')).filter((row) => /^\d+:\d+$/.test(row[1])).map((row) => {
    const [chapter, verse] = row[1].split(':');
    return { ...address(row[0], chapter, verse), sourcePage: Number(row[2]), noteNumber: Number(row[3]), noteText: row[4], indexCorroboration: row[5] === 'yes' };
  });
  const invalidCrossReferences = rows(section(text, '### 6.2', '### 6.3')).filter((row) => /^\d+$/.test(row[0])).map((row) => ({
    noteNumber: Number(row[0]), anchor: parseAddress(row[1]), rawCitation: row[2], explanation: row[3],
  }));
  const legacyNotes = rows(section(text, '### 6.7', '## 7.')).filter((row) => /^\d+$/.test(row[0])).map((row) => ({
    noteNumber: Number(row[0]), anchor: parseAddress(row[1]), originalCitation: row[2], seeAlso: row[3],
  }));

  const repeatedPassagesText = section(text, '### 6.3', '### 6.4').trim();
  const repeatedPairs = [];
  for (const line of repeatedPassagesText.split(/\r?\n/).filter((entry) => entry.startsWith('- **'))) {
    const chapters = line.match(/^\- \*\*([A-Za-z]+) (\d+) and ([A-Za-z]+) (\d+)\*\*:/);
    if (chapters) {
      const ranges = line.match(/\(([^=]+)=([^\)]+)\)/);
      if (!ranges) throw new Error(`Cannot read repeated chapter ranges: ${line}`);
      const expand = (value, book) => [...value.matchAll(/(\d+):(\d+)(?:[–-](\d+))?/g)].flatMap((m) =>
        Array.from({ length: Number(m[3] ?? m[2]) - Number(m[2]) + 1 }, (_, index) => address(book, m[1], Number(m[2]) + index)));
      const left = expand(ranges[1], chapters[1]);
      const right = expand(ranges[2], chapters[3]);
      if (left.length !== right.length) throw new Error('Repeated chapter range lengths disagree.');
      left.forEach((entry, index) => repeatedPairs.push([entry, right[index]]));
    } else {
      const bolds = [...line.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]);
      for (const bold of bolds) {
        const parts = bold.split(/ and | = /);
        const expand = (value) => {
          const m = value.match(/^([A-Za-z]+) (\d+):(\d+)(?:[–-](\d+))?$/);
          if (!m) throw new Error(`Cannot read repeated verse range: ${value}`);
          return Array.from({ length: Number(m[4] ?? m[3]) - Number(m[3]) + 1 }, (_, index) => address(m[1], m[2], Number(m[3]) + index));
        };
        if (parts.length !== 2) throw new Error(`Cannot read repeated passage statement: ${bold}`);
        const left = expand(parts[0]); const right = expand(parts[1]);
        if (left.length !== right.length) throw new Error('Repeated verse range lengths disagree.');
        left.forEach((entry, index) => repeatedPairs.push([entry, right[index]]));
      }
    }
  }
  const inferredJoinsText = section(text, '### 6.5', '### 6.6').trim();
  const inferredJoins = [...inferredJoinsText.matchAll(/([A-Z]+) (\d+):(\d+): `([^`]+)`/g)].map((m) => ({ ...address(m[1], m[2], m[3]), joinedText: m[4] }));
  const countMatch = inferredJoinsText.match(/\*\*(\d+) em dashes/);
  if (!countMatch || inferredJoins.length !== Number(countMatch[1])) throw new Error('Inferred em-dash joins do not reconcile within the validation report.');
  const originalPdfSha256 = text.match(/SHA-256 `([a-f0-9]{64})`/)?.[1];
  if (!originalPdfSha256) throw new Error('Original PDF hash missing from validation report.');
  const nonBlankLineCount = Number(text.match(/same ([\d,]+) non-blank lines/)?.[1].replaceAll(',', ''));
  const noteTypeCounts = Object.fromEntries([...text.matchAll(/\b(Reflection|Clarification|Context|Definition) (\d+)/g)].map((match) => [match[1], Number(match[2])]));
  if (!Number.isInteger(nonBlankLineCount) || Object.keys(noteTypeCounts).length !== 4) throw new Error('Report line/note-type counts are missing.');
  return { counts, books, chapterCounts, emptyReferences, invalidCrossReferences, legacyNotes, repeatedPairs, nonBlankLineCount, noteTypeCounts,
    repeatedPassagesText, inferredJoins, punctuationReview: section(text, '### 6.4', '### 6.5').trim(),
    originalPdfSha256, sha256: sha256(text),
    independentPdfComparison: { reportedWordTokens: Number(text.match(/same ([\d,]+) word tokens/)?.[1].replaceAll(',', '')), verifiedByThisParser: false, attribution: 'Validation report sections 1 and 5; no new PDF token comparison was performed.' } };
}

module.exports = { readValidationReport, sha256 };
