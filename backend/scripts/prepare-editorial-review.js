// Editorial evidence/decision preparation only: no manuscript or database writes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { run: inspectSource } = require('./review-source-warnings');
const { sha256 } = require('./ingestion/read-validation-report');
const root = path.join(__dirname, '..');
const classifications = {
  MISSING_SOURCE_TEXT: ['source_omission', 'high', 'Supply exact authored wording, or explicitly accept this reference as unresolved; separately decide its probable note anchor.'],
  INFERRED_NOTE_ANCHOR: ['unconfirmed_relationship', 'high', 'Confirm or replace the probable anchor. Author confirmation does not create a footnote marker in the original PDF.'],
  INVALID_CROSS_REFERENCE_TARGET: ['broken_citation', 'high', 'Specify the intended existing reference, or accept the original broken citation with its unresolved status.'],
  REPEATED_SOURCE_PASSAGE: ['source_attested_repetition', 'review', 'Confirm intentional repetition, request specific revisions, or defer. Preserve every occurrence meanwhile.'],
  LEGACY_BOOK_NAME: ['legacy_citation', 'review', 'Decide whether to preserve the historical citation or specify exact title/address changes. Do not assume renumbering from a title change.'],
  PUNCTUATION_REVIEW: ['printed_punctuation', 'review', 'Accept the printed punctuation/styles or specify exact changes for individual examples.'],
  INFERRED_SOURCE_LINE_JOIN: ['uncertain_spacing', 'review', 'Confirm the displayed dash join or specify exact spacing. PDF line wrapping cannot establish intended spaces.'],
};
const candidateAddresses = {
  104: ['inquiry:1:3', 'inquiry:1:5', 'freedom:28:8'],
  490: ['freedom:13:8'],
  1191: ['relationships:24:4', 'relationships:26:4', 'relationships:32:10'],
  1314: ['freedom:27:17'],
};
const identity = anchor => `${anchor.bookSlug}:${anchor.chapter}:${anchor.verse}`;
const fingerprint = entry => sha256(JSON.stringify(entry.finding));

function pendingDecisions(evidence) {
  return { schemaVersion: 1, status: 'AUTHOR_REVIEW_PENDING', importApproved: false,
    authorIdentity: { role: 'awaiting_confirmation', displayName: null, assertion: null },
    sourceManifest: evidence.sourceManifest,
    decisions: evidence.entries.map(entry => ({ issueId: entry.id, issueSha256: fingerprint(entry), code: entry.code,
      status: 'pending', action: null, rationale: null, reviewer: null, decidedAt: null, authorResponse: null })) };
}

function validateDecisions(evidence, record) {
  assert.equal(record.importApproved, false, 'Editorial review must not approve imports.');
  assert.ok(isDeepStrictEqual(record.sourceManifest, evidence.sourceManifest), 'Decision record source hashes are stale; review and migrate explicitly.');
  assert.equal(record.decisions.length, evidence.entries.length, 'Every finding requires its own decision slot.');
  assert.equal(new Set(record.decisions.map(value => value.issueId)).size, record.decisions.length, 'Duplicate decision identities.');
  for (const entry of evidence.entries) {
    const decision = record.decisions.find(value => value.issueId === entry.id);
    assert.ok(decision && decision.issueSha256 === fingerprint(entry) && decision.code === entry.code, `Stale/unknown finding: ${entry.id}`);
    assert.ok(['pending', 'accepted', 'correction_requested', 'deferred'].includes(decision.status), 'Unknown editorial decision status.');
    if (decision.status !== 'pending') {
      assert.ok(['author', 'authorized_editor'].includes(record.authorIdentity?.role), 'Author/editor identity must be confirmed.');
      for (const field of ['action', 'rationale', 'reviewer', 'authorResponse']) assert.ok(typeof decision[field] === 'string' && decision[field].trim(), `Missing ${field}: ${entry.id}`);
      assert.ok(Number.isFinite(Date.parse(decision.decidedAt)), `Missing decision date: ${entry.id}`);
    }
  }
}

function buildReview({ evidence, canonical, supporting, decisions }) {
  validateDecisions(evidence, decisions);
  const verses = new Map(canonical.books.flatMap(book => book.chapters.flatMap(chapter =>
    chapter.verses.map(verse => [`${book.slug}:${chapter.number}:${verse.number}`, verse]))));
  const notes = new Map(supporting.notes.map(note => [note.noteNumber, note]));
  const verse = id => { assert.ok(verses.has(id), `Candidate/source verse not found: ${id}`); return { reference: id, ...verses.get(id) }; };
  const entries = evidence.entries.map(entry => {
    assert.ok(classifications[entry.code], `Unclassified finding: ${entry.code}`);
    const [classification, priority, authorQuestion] = classifications[entry.code];
    const detail = entry.finding.detail;
    const noteNumber = detail.noteNumber ?? detail.report?.probableNoteNumber;
    const note = noteNumber ? notes.get(noteNumber) : null;
    if (noteNumber) assert.ok(note, `Missing supporting note ${noteNumber}`);
    const result = { issueId: entry.id, issueSha256: fingerprint(entry), code: entry.code, classification, priority,
      sourceFinding: entry.finding, sourceEvidence: entry.evidence, authorQuestion,
      decision: decisions.decisions.find(value => value.issueId === entry.id), contentChanged: false };
    if (note) result.note = note;
    if (entry.code === 'MISSING_SOURCE_TEXT') {
      result.relatedIssueIds = evidence.entries.filter(other => other.code === 'INFERRED_NOTE_ANCHOR' && other.finding.detail.noteNumber === noteNumber).map(other => other.id);
      assert.equal(result.relatedIssueIds.length, 1, 'Missing reference must retain its separate inferred-anchor finding.');
      const counterpart = { 'society:42:4': 'society:43:4', 'identity:13:4': 'identity:14:4' }[detail.reference];
      if (counterpart) result.parallelPassage = { ...verse(counterpart), useApproved: false,
        reason: 'Authored counterpart in a nearly repeated chapter. This suggests a possibility, not the missing wording or intended author decision.' };
    }
    if (entry.code === 'INFERRED_NOTE_ANCHOR') result.relatedIssueIds = evidence.entries
      .filter(other => other.code === 'MISSING_SOURCE_TEXT' && other.finding.detail.reference === detail.anchor).map(other => other.id);
    if (entry.code === 'REPEATED_SOURCE_PASSAGE') {
      result.passages = detail.references.map(id => ({ ...verse(id), pdfPages: [...new Set(entry.evidence.passages.find(passage => passage.reference === id).lines.map(line => line.page))] }));
      assert.ok(result.passages.every(passage => passage.text === result.passages[0].text), `Repeated draft text differs: ${entry.id}`);
      result.intent = result.decision.status === 'accepted' && result.decision.action === 'preserve_intentional_repetition' ? 'AUTHOR_CONFIRMED' : 'NOT_ESTABLISHED';
      result.recommendation = 'Preserve every original occurrence. Source repetition is established; intention requires a separate author decision.';
    }
    if (entry.code === 'INVALID_CROSS_REFERENCE_TARGET' || entry.code === 'LEGACY_BOOK_NAME') {
      const anchorId = identity(note.anchor);
      const unresolved = canonical.unresolvedReferences.find(reference => reference.canonicalId === anchorId);
      assert.ok(verses.has(anchorId) || unresolved, `Supporting anchor does not exist: ${anchorId}`);
      result.anchorVerse = verses.has(anchorId) ? verse(anchorId) : { reference: anchorId, status: 'missing_source_text', unresolved };
      result.citations = supporting.crossReferences.filter(ref => ref.noteNumber === note.noteNumber);
      result.indexEntries = supporting.crossReferenceIndex.filter(index => index.matchedNoteNumber === note.noteNumber);
      result.currentTargets = result.citations.flatMap(ref => ref.targets).map(target => ({ ...target,
        ...(verses.has(identity(target)) ? { text: verses.get(identity(target)).text } : {}) }));
      result.candidates = (candidateAddresses[note.noteNumber] ?? []).map(id => ({ ...verse(id), status: 'THEMATIC_CANDIDATE_ONLY', intendedTargetEstablished: false }));
      if (entry.code === 'INVALID_CROSS_REFERENCE_TARGET') {
        assert.equal(verses.has(identity(detail.target)), false);
        result.investigation = 'The original note and Cross-Reference Index agree on a target absent from the PDF chapter inventory. Agreement corroborates the broken citation, not a replacement. Candidates are editorial suggestions only.';
      } else {
        const citations = [...note.text.matchAll(/\b(Seeker|Responsibility)\s+(\d+):(\d+)/g)];
        result.legacyCitations = citations.map(match => ({ title: match[1], chapter: Number(match[2]), verse: Number(match[3]), raw: match[0] }));
        result.mappingAssessment = citations.some(match => result.currentTargets.some(target => Number(match[2]) !== target.chapter || Number(match[3]) !== target.verse))
          ? 'TITLE_AND_ADDRESS_DIFFER: no historical edition establishes a verified renumbering map.'
          : 'SAME_NUMBERS_DIFFERENT_TITLE: coexistence in this note is evidence, not author approval of a global alias.';
        if ([1314, 1367].includes(note.noteNumber)) result.editorialObservation = note.noteNumber === 1314
          ? 'Note discusses death disregarding rank; its existing Freedom 27:11 target discusses courage in inquiry. Freedom 27:17 discusses death as an equaliser. Author must establish the intended relationship.'
          : 'Note discusses learning on one\'s own behalf; its existing Freedom 25:3 target discusses natural motives without unseen forces. The topics are related broadly, but the intended legacy verse mapping is unverified.';
      }
    }
    if (entry.code === 'PUNCTUATION_REVIEW') result.examples = entry.evidence.examples.map(example => ({ ...verse(example.reference), pdfPages: [...new Set(example.lines.map(line => line.page))] }));
    if (entry.code === 'INFERRED_SOURCE_LINE_JOIN') {
      result.verse = verse(`${detail.bookSlug}:${detail.chapter}:${detail.verse}`);
      assert.ok(result.verse.text.includes(detail.joinedText), 'Inferred join is absent from current text.');
      result.spacingEstablished = false;
    }
    return result;
  });
  const counts = Object.fromEntries(Object.keys(classifications).map(code => [code, entries.filter(entry => entry.code === code).length]));
  return { schemaVersion: 1, status: entries.every(entry => entry.decision.status === 'accepted') ? 'AUTHOR_FINDINGS_REVIEWED' : 'AUTHOR_REVIEW_OPEN', importApproved: false, sourceManifest: evidence.sourceManifest,
    authorIdentity: decisions.authorIdentity, pdfChecks: evidence.checks, counts,
    decisions: Object.fromEntries(['pending', 'accepted', 'correction_requested', 'deferred'].map(status => [status, entries.filter(entry => entry.decision.status === status).length])),
    limitations: evidence.limitations, sourceFilesModified: false, databaseModified: false, entries };
}

const cell = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
const quote = text => String(text).split(/\r?\n/).map(line => `> ${line}`).join('\n');
const pages = evidence => [...new Set((evidence.lines ?? evidence.sourceBoundary ?? []).map(line => line.page))].join(', ');

function renderRepetitions(review) {
  const entries = review.entries.filter(entry => entry.code === 'REPEATED_SOURCE_PASSAGE');
  const groups = new Map();
  for (const entry of entries) { const key = entry.passages.map(passage => passage.reference.split(':').slice(0, 2).join(' ')).join(' / ');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry); }
  let text = '# Repeated passages: complete author review\n\nA group is one identical authored verse at two printed addresses. All occurrences remain unchanged. Source presence does not establish intention. No repetition is approved merely by appearing in this list.\n\n';
  text += `Total: ${entries.length} groups; ${entries.reduce((sum, entry) => sum + entry.passages.length, 0)} printed occurrences. Each column preserves its own exact decoded working-edition string; table line breaks are presentation only. PDF checks ignore whitespace.\n\n`;
  text += 'Society 42/43 and Identity 13/14 are nearly repeated chapters, not interchangeable chapters: Society 42:4 and Identity 13:4 have missing text, and Identity 13:25/14:25 differ by the word "neither". Do not copy, delete, merge, or renumber chapters from this table.\n\n';
  for (const [group, findings] of groups) {
    text += `## ${group} (${findings.length} groups)\n\n| Finding | First occurrence | Second occurrence | Author decision |\n| --- | --- | --- | --- |\n`;
    for (const entry of findings) text += `| ${entry.issueId} | ${cell(entry.passages[0].reference)} (PDF ${entry.passages[0].pdfPages.join(', ')})<br>${cell(entry.passages[0].text)} | ${cell(entry.passages[1].reference)} (PDF ${entry.passages[1].pdfPages.join(', ')})<br>${cell(entry.passages[1].text)} | ${entry.decision.status}; intent ${entry.intent} |\n`;
    text += '\n';
  }
  return text;
}

function renderReview(review) {
  let text = '# Source findings: complete editorial review\n\nEvery existing finding is classified individually. Authored content, source flags, inferred relationships and all repetitions remain unchanged. Import approval is false. Recommendations and thematic candidate verses are not author decisions.\n\n';
  text += `Review status: ${review.status}. This describes author decisions on findings, not canonical-content or import approval. Accepted preservation retains the original uncertainty.\n\n`;
  text += `Decisions: ${Object.entries(review.decisions).map(([status, count]) => `${status} ${count}`).join('; ')}. Author identity: ${review.authorIdentity.role}.\n\n`;
  text += '| Classification | Findings | Author decisions | Review guidance |\n| --- | ---: | --- | --- |\n';
  for (const [code, count] of Object.entries(review.counts)) {
    const accepted = review.entries.filter(entry => entry.code === code && entry.decision.status === 'accepted').length;
    text += `| ${classifications[code][0]} | ${count} | ${accepted} accepted | ${classifications[code][2]} |\n`;
  }
  text += '\nDecisions live in [AUTHOR_DECISIONS.json](AUTHOR_DECISIONS.json), separately from regenerable evidence. Each decision is bound to its finding fingerprint and all ten data-file hashes. Pending/deferred/correction-requested cases remain open; acceptance does not approve an import or rewrite a source.\n\n';
  text += review.authorIdentity.role === 'author'
    ? 'The author identified themselves in this conversation. No substantive editorial decision has been inferred from that identity statement or from a question about passage groups.\n\n'
    : 'Author/editor identity must be confirmed before recording a substantive decision. Pending evidence is not author approval.\n\n';
  text += '## Broken citations: investigation\n\nThe three original targets do not exist. The original notes and index agree on them; none supplies an unambiguous replacement. The following candidates were found by comparing topics in the current corpus, not by recovering a historical numbering map.\n\n';
  for (const entry of review.entries.filter(entry => entry.code === 'INVALID_CROSS_REFERENCE_TARGET')) {
    text += `### ${entry.issueId}: note ${entry.note.noteNumber}\n\nAnchor: ${entry.anchorVerse.reference}. Note PDF page(s): ${pages(entry.sourceEvidence)}. Missing target: ${identity(entry.sourceFinding.detail.target)}.\n\n${quote(entry.note.rawText)}\n\n`;
    text += `Target chapter contains: ${entry.sourceEvidence.targetChapterReferences.join(', ')}. Index: ${entry.indexEntries.map(index => index.id + ' — ' + index.raw).join('; ')}.\n\n`;
    text += '| Thematic candidate only | Exact current verse |\n| --- | --- |\n';
    for (const candidate of entry.candidates) text += `| ${candidate.reference} | ${cell(candidate.text)} |\n`;
    text += `\nAuthor decision: ${entry.decision.status}${entry.decision.action ? ` (${entry.decision.action})` : ''}.\n\n`;
    if (entry.decision.authorResponse) text += `Recorded author response:\n\n${quote(entry.decision.authorResponse)}\n\n${entry.decision.rationale}\n\n`;
    else text += 'Specify an intended reference, preserve the broken citation explicitly, or defer. A nearby number or similar topic is not sufficient evidence to correct it.\n\n';
  }
  text += '## Missing text and probable anchors: paired cases\n\nThese are 31 cases covering 62 separate warnings. Deciding missing wording does not automatically confirm an anchor, and confirming an anchor does not create missing verse text. Original PDF marker absence must remain recorded even after author confirmation.\n\n';
  for (const entry of review.entries.filter(entry => entry.code === 'MISSING_SOURCE_TEXT')) {
    const anchor = review.entries.find(value => value.issueId === entry.relatedIssueIds[0]);
    text += `### ${entry.issueId} / ${anchor.issueId}: ${entry.sourceFinding.detail.reference}\n\nPDF page ${entry.sourceEvidence.referencePage}: empty authored text. Probable note ${entry.note.noteNumber}; no original marker.\n\n${quote(entry.note.rawText)}\n\n`;
    if (entry.parallelPassage) text += `Authored counterpart ${entry.parallelPassage.reference}, **not approved for copying**:\n\n${quote(entry.parallelPassage.text)}\n\n`;
    text += `Wording decision: ${entry.decision.status}. Anchor decision: ${anchor.decision.status}. Supply exact wording or accept the unresolved reference separately from confirming/replacing the note anchor.\n\n`;
  }
  text += '## Repetition findings\n\nThe [complete side-by-side repetition list](REPEATED_PASSAGES.md) contains every repeated pair, its wording and PDF pages. All remain present.\n\n| Finding | Addresses | Author intent | Decision |\n| --- | --- | --- | --- |\n';
  for (const entry of review.entries.filter(entry => entry.code === 'REPEATED_SOURCE_PASSAGE')) text += `| ${entry.issueId} | ${entry.passages.map(passage => passage.reference).join(' / ')} | ${entry.intent} | ${entry.decision.status} |\n`;
  text += '\n## Legacy citations\n\nA current See also link is not proof of a historical alias or renumbering. Preserve the authored legacy name until the author decides. Existence of a target proves neither topical alignment nor intended reference.\n\n';
  for (const entry of review.entries.filter(entry => entry.code === 'LEGACY_BOOK_NAME')) {
    text += `### ${entry.issueId}: note ${entry.note.noteNumber}\n\nAnchor ${entry.anchorVerse.reference}; PDF ${pages(entry.sourceEvidence)}.\n\n${quote(entry.note.rawText)}\n\n${entry.mappingAssessment}\n\n`;
    for (const target of entry.currentTargets) text += `Current target ${identity(target)} (${target.status}):\n\n${target.text ? quote(target.text) : '**No authored target exists.**'}\n\n`;
    if (entry.editorialObservation) text += `Editorial observation requiring author judgement: ${entry.editorialObservation}\n\n`;
    for (const candidate of entry.candidates) text += `Unapproved thematic candidate ${candidate.reference}:\n\n${quote(candidate.text)}\n\n`;
    text += `Decision: ${entry.decision.status}.\n\n`;
  }
  for (const entry of review.entries.filter(entry => entry.code === 'PUNCTUATION_REVIEW')) {
    text += `## ${entry.issueId}: printed punctuation\n\nThis is one consolidated warning, not one isolated typo. All observations remain as printed:\n\n${entry.sourceFinding.detail.rawReportText}\n\n| Example | PDF pages | Exact current verse |\n| --- | --- | --- |\n`;
    for (const example of entry.examples) text += `| ${example.reference} | ${example.pdfPages.join(', ')} | ${cell(example.text)} |\n`;
    text += `\nAuthor decision: ${entry.decision.status}. Mixed quote/apostrophe forms and dash styles are not normalized automatically.\n\n`;
  }
  text += '## Inferred dash spacing\n\nEach PDF boundary below confirms the line break, not intended spaces. The displayed join is the current working-edition text, not a new correction.\n\n| Finding | Reference / PDF pages | Current join | PDF boundary fragments | Decision |\n| --- | --- | --- | --- | --- |\n';
  for (const entry of review.entries.filter(entry => entry.code === 'INFERRED_SOURCE_LINE_JOIN')) text += `| ${entry.issueId} | ${entry.verse.reference} / ${pages(entry.sourceEvidence)} | ${cell(entry.sourceFinding.detail.joinedText)} | ${entry.sourceEvidence.sourceBoundary.map(line => cell(line.text)).join('<br>')} | ${entry.decision.status} |\n`;
  text += '\n## Verification scope\n\nOriginal PDF character-layer checks cover all references, authored verses, notes and original note markers. Whitespace is excluded. No page-image review or independent second extractor was available, so dash/paragraph layout cannot be certified by this evidence. No editorial decisions, source changes, candidate imports or database writes are performed by preparing this packet.\n';
  return text;
}

async function run({ check = false } = {}) {
  const evidence = await inspectSource({ write: false, quiet: true });
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const decisionPath = path.join(root, 'docs/AUTHOR_DECISIONS.json');
  const decisions = fs.existsSync(decisionPath) ? read('docs/AUTHOR_DECISIONS.json') : pendingDecisions(evidence);
  const review = buildReview({ evidence, canonical: read('data/canonical-content.draft.json'), supporting: read('data/supporting-material.draft.json'), decisions });
  const outputs = { 'EDITORIAL_REVIEW.json': JSON.stringify(review, null, 2) + '\n', 'EDITORIAL_REVIEW.md': renderReview(review), 'REPEATED_PASSAGES.md': renderRepetitions(review) };
  for (const entry of evidence.sourceManifest) assert.equal(sha256(fs.readFileSync(path.join(root, 'data', entry.file))), entry.sha256, `Source modified: ${entry.file}`);
  if (check) {
    assert.ok(fs.existsSync(decisionPath), 'Author decision record has not been prepared.');
    for (const [name, text] of Object.entries(outputs)) assert.equal(fs.readFileSync(path.join(root, 'docs', name), 'utf8'), text, `Stale editorial packet: ${name}`);
  } else {
    if (!fs.existsSync(decisionPath)) fs.writeFileSync(decisionPath, JSON.stringify(decisions, null, 2) + '\n', { flag: 'wx' });
    for (const [name, text] of Object.entries(outputs)) fs.writeFileSync(path.join(root, 'docs', name), text);
  }
  console.log(JSON.stringify({ checkOnly: check, classified: review.entries.length, counts: review.counts, decisions: review.decisions,
    dataFilesUnchanged: evidence.sourceManifest.length, databaseModified: false, importApproved: false }, null, 2));
  return review;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--check')) { console.error('Only --check is supported.'); process.exitCode = 1; }
  else run({ check: args.includes('--check') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { buildReview, pendingDecisions, validateDecisions, renderReview, renderRepetitions, run };
