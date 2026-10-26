// Synthetic text only. This fixture is never an approved Human Testament edition.
const { createHash } = require('node:crypto');
const { Types } = require('mongoose');
const hash = value => createHash('sha256').update(value).digest('hex');
const text = "  “Synthetic quotation”—unchanged; apostrophe’s and 'straight'.\nSecond line.\n\nFinal paragraph ?;  ";
function fixture() {
  const editionId = 'synthetic-test-edition-v1', sourceVersion = 'synthetic-v1';
  const base = { editionId, sourceVersion, isPublished: true };
  const book = { ...base, _id: new Types.ObjectId(), slug: 'fixture', title: '  SYNTHETIC BOOK  ',
    subtitle: 'Unicode — source', description: '', order: 1, chapterCount: 2 };
  const chapters = [1, 2].map(number => ({ ...base, _id: new Types.ObjectId(), book: book._id,
    bookSlug: book.slug, number, title: '', referenceCount: number === 1 ? 3 : 1,
    completeness: number === 1 ? 'source_incomplete' : 'complete' }));
  const verse = (chapter, number, content) => ({ ...base, _id: new Types.ObjectId(), book: book._id, chapter: chapters[chapter - 1]._id,
    bookSlug: book.slug, chapterNumber: chapter, number, canonicalId: `fixture:${chapter}:${number}`,
    status: content === undefined ? 'missing_source_text' : 'authored', ...(content === undefined ? {
      unresolved: { reviewRequired: true, reason: 'Synthetic missing source.', editorialFlags: [{ raw: '[[FLAG: SYNTHETIC MISSING TEXT]]', line: 30 }] },
    } : { text: content }), source: { textLines: [chapter * 10 + number] } });
  const verses = [verse(1, 1, text), verse(1, 2, text), verse(1, 3), verse(2, 1, 'A second chapter—synthetic only.')];
  const notes = ['Reflection', 'Clarification', 'Context', 'Definition'].map((type, index) => {
    const inferred = index === 3, number = index + 1, anchorVerse = index < 2 ? 1 : index === 2 ? 2 : 3;
    const noteText = `${type}.  Synthetic “note”—with apostrophe’s.\nKeep this line.  `;
    const citation = index === 0 ? 'See also: 2:1' : index === 2 ? 'See also: 2:99' : null;
    return { ...base, noteNumber: number, bookSlug: 'fixture', type, text: noteText,
      rawText: noteText + (citation ? '\n' + citation : ''), markerText: `[[Note ${number} · 1:${anchorVerse}${inferred ? ' · PROBABLE ANCHOR' : ''}]]`,
      anchor: { bookSlug: 'fixture', chapter: 1, verse: anchorVerse, status: inferred ? 'inferred' : 'explicit',
        sourceMarkerPresent: !inferred, reviewRequired: inferred, indexCorroborated: false }, inferredAnchor: inferred,
      reviewRequired: inferred || index === 2, reviewReasons: inferred ? ['inferred_anchor'] : index === 2 ? ['invalid_cross_reference_target'] : [],
      source: { line: 50 + index }, crossReferenceIds: citation ? [`note:${number}:see-also:1`] : [] };
  });
  const crossReferences = [0, 2].map(index => ({ ...base, id: `note:${index + 1}:see-also:1`, noteNumber: index + 1,
    anchor: { bookSlug: 'fixture', chapter: 1, verse: index === 0 ? 1 : 2 }, raw: index === 0 ? 'See also: 2:1' : 'See also: 2:99',
    targets: [{ bookSlug: 'fixture', chapter: 2, verse: index === 0 ? 1 : 99, referenceExists: index === 0,
      authoredTextExists: index === 0, status: index === 0 ? 'resolved' : 'missing_reference', raw: index === 0 ? '2:1' : '2:99' }],
    reviewRequired: index !== 0, sourceLine: 60 + index }));
  const index = crossReferences.map((ref, position) => ({ ...base, id: `index:${position + 1}`,
    rawSource: `Fixture 1:${ref.anchor.verse}`, raw: ref.raw, anchor: ref.anchor, targets: ref.targets,
    matchedNoteNumber: ref.noteNumber, reviewRequired: ref.reviewRequired, sourceLines: [70 + position * 2, 71 + position * 2] }));
  const glossary = [{ ...base, term: '  Synthetic term  ', definition: '  Exact definition—“quoted”.\nSecond line.  ',
    bookSlug: 'fixture', bookTag: '(Fixture)', sourceLines: [80, 81, 82] }];
  const sections = ['front_matter', 'back_matter', 'chapter_supporting_material'].map((kind, position) => ({ ...base,
    id: `section:${position + 1}`, kind, sourceLine: 90 + position, ...(position === 2 ? { bookSlug: 'fixture', chapter: 1 } : {}),
    marker: `[[${kind}]]`, lines: [{ line: 91 + position, raw: '  Synthetic section—unchanged.  ' }] }));
  const edition = { editionId, sourceVersion, datasetSha256: hash(text), approvalStatus: 'APPROVED', isPublished: true,
    sourceManifest: [{ path: 'test-fixtures/canonical.js', format: 'JS', role: 'authoritative_manuscript', sha256: hash(text) }],
    validation: { structuralPassed: true, textFidelityPassed: true }, sourceIssues: [{ id: 'fixture-missing' }, { id: 'fixture-invalid' }],
    approval: { approvedBy: 'synthetic-fixture-only', approvedAt: '2026-10-11T00:00:00Z', reviewRecordSha256: hash('synthetic decisions'),
      issueDecisions: ['fixture-missing', 'fixture-invalid'].map(issueId => ({ issueId, status: 'accepted', rationale: 'Deliberate synthetic fixture.', reviewedBy: 'test' })) },
    editorialApparatus: [{ raw: '[[SYNTHETIC EDITORIAL APPARATUS]]' }] };
  return { edition, books: [book], chapters, verses, notes, crossReferences, index, glossary, sections };
}
module.exports = { fixture, text };
