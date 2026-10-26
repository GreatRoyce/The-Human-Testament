# Canonical content fidelity handoff

Verified 2026-10-11. Technical retrieval is implemented and tested. Human Testament content remains **DRAFT_REVIEW_REQUIRED** and **NOT APPROVED FOR IMPORT**. No manuscript wording, reference, draft, validation report, or configured database record was changed in this stage. All ten existing data files remain byte-identical. No files were moved or deleted.

## Audit and authority

The existing backend uses CommonJS, Node.js, Express 5, Mongoose 9, MongoDB, `pdf-parse`, and `mammoth`. It initially exposed health, published-book list/detail, and chapter detail with verses. Controllers queried Mongoose directly; supporting-material models/routes were absent; authored string setters trimmed text. The frontend used a centralized service layer, but expected unwrapped responses and rendered one preview commentary item per verse.

The existing ingestion parser/reconciliation was retained. The task's baseline reported 15 tests; the checkout actually had 15 ingestion and seven HTTP tests. All remain in place, with stronger coverage added.

Inspected files/dependencies:

- Backend package configuration/lockfile, `,gitignore`, app/server/database configuration, Book/Chapter/Verse models, book controller/routes, and error middleware.
- `scripts/extract-manuscript.js`, `import-canonical.js`, `parse-clean-manuscript.js`, `check-read-api.js`, `review-source-warnings.js`, and existing ingestion parser, report-reader, and validator modules.
- Existing ingestion/HTTP tests and ingestion, source-review, and API verification documents.
- All ten `data/` files: PDF, clean TXT/DOCX, Markdown report, canonical scaffold, two historical extractions, two structured drafts, and ingestion report. PDF inspection used its character layer, not page images.
- Frontend package/configuration, API client/adapter/error type, Testament contracts/services/hooks, mock provider/data, reader components/selection hook, app routes/pages, search rendering, existing tests and home/content checks.

| Source | Role |
| --- | --- |
| Master manuscript PDF | Authoritative manuscript. Hashes establish identity; actual comparisons establish only their documented fidelity scope. |
| Clean TXT/DOCX | Working representations; their agreement alone is not PDF verification. |
| Markdown report | Validation evidence, never an alternative source of wording. |
| Canonical/supporting drafts and ingestion report | Unapproved generated representations of clean TXT plus report. |
| `canonical-content.json` | Untouched empty import scaffold. |
| Both historical extraction TXT files | Preserved artifacts, not substituted for the designated input. |

`SOURCE_MANIFEST.json` records all ten paths, formats, roles, hashes, derivations, inherited edition identifier, checks, outstanding issues, and lack of approval. The inherited `2024-07-09` identifier is not a verified manuscript date. Historical derivation descriptions come from existing project evidence, not newly certified extraction results.

## Fidelity evidence and limitations

`npm run fidelity:check` writes nothing and never connects to MongoDB. `npm run fidelity:report` additionally writes only `docs/SOURCE_MANIFEST.json`. Both rehash all ten data files before/after verification.

All **32 checks pass**:

- Fresh in-memory parsing exactly matches every book/chapter/verse, unresolved reference, note, cross-reference, index entry, glossary entry, section, and editorial-apparatus object in the existing drafts.
- Complete canonical/supporting/report artifacts, including every provenance hash, issue, and unapproved metadata field, exactly match regeneration. Altered manifests and removed review findings are regression-tested.
- All 11,618 nonblank DOCX/TXT lines match exactly, including spaces within lines. Blank-line agreement is not established by this comparison.
- Direct master-PDF character checks cover 3,874 authored verses, 1,470 raw notes, 3,905 reference identities, 31 empty references, and 1,439 explicit footnote markers, plus evidence for all 206 warnings.
- Direct PDF checks cover all ten book titles/subtitles and all eight preserved front/back sections, including the complete index and glossary sections.
- Existing structural reconciliation passes all 524 comparisons.

PDF comparisons remove whitespace and running headers/page numbers above y=600; table-of-contents comparisons additionally omit dot leaders. These are comparison operations only: no stored source/draft strings are normalized. There was no page-image review or independent second extraction engine. These checks do not resolve 49 inferred dash spacings or certify meaningful paragraph layout against the PDF. Exact TXT/draft comparisons demonstrate preservation of the working edition, not editorial approval.

Recalculated counts match the reported corpus baseline: 10 books, 230 chapters, 3,905 references, 3,874 authored verses, 31 unresolved references, 1,470 notes, 1,439 explicit/31 inferred anchors, 72 note cross-references, 72 index entries, and 38 glossary entries. Zero ingestion errors and zero report inconsistencies.

All 206 findings remain: 31 missing texts, 31 inferred anchors, three invalid targets, 67 repeated-passage groups, 24 legacy-citation notes, one consolidated punctuation finding, and 49 inferred joins. Relationships chapter 1 remains at 14 references; Relationships 1:16 remains invalid. Nothing was invented or silently corrected.

## Data and API contract

Requests follow route → controller → content service → repository → Mongoose. They read stored records and never parse manuscript files. Existing route conventions and `success/data` envelopes remain.

New GET routes:

```text
/api/books/:slug/chapters
/api/books/:slug/chapters/:chapterNumber/verses
/api/books/:slug/chapters/:chapterNumber/verses/:verseNumber
/api/books/:slug/chapters/:chapterNumber/verses/:verseNumber/supporting-material
/api/verses/:canonicalId
/api/cross-references
/api/cross-references/index
/api/glossary
/api/sections?kind=front_matter|back_matter|chapter_supporting_material
```

Book detail now includes chapters. Chapter detail includes ordered reference records, every associated note/cross-reference, and supporting sections. Stable verse identity is `bookSlug:chapterNumber:verseNumber`, independent of database object IDs.

Authored verses have `status: authored` and exact text. Missing references have `status: missing_source_text`, unresolved metadata, and **no text property**. Editorial flags remain metadata. Completeness distinguishes `complete`, `source_incomplete` (all references present, some text missing), and `excerpt`.

Schemas preserve authored strings without trimming or implicit string conversion. Edition, Note, CrossReference, CrossReferenceIndex, GlossaryEntry, and ContentSection models preserve supporting text, categories, raw citations/markers, provenance, and anchor uncertainty. Supporting-model provenance fields are retained rather than discarded. Edition-scoped unique identities protect all nine collections. A partial unique index allows one published edition. Automatic collection/index creation is disabled; existing indexes were not changed. Old globally unique book indexes require a deliberate migration before multiple editions are stored.

Public reads require an approved published Edition and published records in that edition. Approval metadata requires manifest hashes, dataset version/hash, structural/text-fidelity results, named approval/date/review-record hash, and a unique resolved/accepted decision with rationale/reviewer for every issue. A publication flag alone is insufficient. This is a metadata-consistency gate, not a digital signature or proof of authentic human approval. No approval/publication mutation endpoint was added.

## Import boundary

The importer retains read-only scaffold validation. `--write` now fails before loading database code or connecting, even with credentials configured. Repeated refusal and source-file protection are tested. No approved artifact was manufactured.

The synthetic test writer validates and upserts by edition/domain identity, reruns without duplicates, and verifies actual duplicate-index rejection in all nine collections. It is not a production importer. Production transactionality, actual candidate/hash verification, rollback, and rerun behavior require a separately reviewed implementation after approval. Those write capabilities are not claimed as complete.

## Frontend

The centralized REST adapter unwraps envelopes and supplies the legacy nullable commentary field without changing text. Reader contracts preserve edition provenance, chapter titles/reference counts, canonical identities, multiple notes, missing-text status, completeness, and citation/anchor uncertainty. Declaration types include SupportingNote, CrossReference, and ContentSection, with complete chapter supporting collections. All notes render for the selected verse; uncertainty notices stay outside canonical text; whitespace-preserving presentation retains line breaks. Existing mock mode and legacy preview commentary remain available. No routes, styles, assets, or manuscript copy were redesigned.

Backend search remains unimplemented. API mode does not silently fall back to mocks. The mock corpus remains an excerpt/preview, not an approved edition.

## Executed checks

| Check | Result |
| --- | --- |
| Backend `npm test` | 38 pass, including seven real MongoDB persistence/HTTP subtests; all original tests retained. |
| Backend `npm run fidelity:report` | 32 checks pass; ten data files unchanged; approval false. |
| Backend `npm run ingestion:check` / `npm run import:check` | Read-only checks pass; REVIEW_REQUIRED; importer checks only the empty scaffold and explicitly leaves writes disabled. |
| Frontend `npm test` | Nine pass, including exact adapter strings and multi-note/missing-text/uncertainty server rendering. |
| Frontend lint / production build | Both pass. |
| Frontend home check | Pass: landmarks, headings, cards, anchors/ARIA, and unavailable-route recovery. |
| Frontend content check | Pass: 63 route renders, 163 relative imports, nine direct URL requests, three transformed modules. |
| Live `npm run api:check` | Connection/ping and all 13 GET checks pass; PARTIAL because no approved published books exist. No writes or automatic schema creation. |

Real database tests use backend-only `mongodb-memory-server`, a disposable loopback database, and invented synthetic fixtures. They never load `.env` or use `MONGODB_URI`. They cover complete synthetic chapters/supporting collections, Unicode, repetitions, surrounding spaces, paragraph boundaries, unresolved text, inferred anchors, glossary/index/front/back content, publication isolation, and corrupt editorial text. One test follows database → HTTP → real frontend adapter/validation, including edition/chapter metadata. Install both backend and frontend dependencies for these integration checks; the backend suite exercises the real frontend contracts, and frontend tests reuse the synthetic backend fixture. Synthetic fixture approval does not approve any Human Testament content.

The first persistence run timed out during its large Windows MongoDB download; full reruns passed after caching. Fresh test setups may require network access for that binary. No storage test is silently skipped. Sandbox spawn/DNS restrictions required authorized reruns. No in-app browser was available; static/server-render checks do not establish visual appearance, click/focus behavior, mobile viewports, or screen-reader behavior.

## Change inventory

Created:

- `.gitignore`: intended exclusions from the existing misspelled `,gitignore`; existing tracked files stay tracked.
- `docs/SOURCE_MANIFEST.json`, `docs/CANONICAL_CONTENT_PIPELINE.md`: evidence and handoff.
- `scripts/verify-content-fidelity.js`, `scripts/ingestion/compare-pdf-supporting.js`: read-only comparisons.
- `src/models/contentFields.js`, `Edition.js`, `Note.js`, `CrossReference.js`, `CrossReferenceIndex.js`, `GlossaryEntry.js`, `ContentSection.js`: exact-string/supporting schemas.
- `src/repositories/content.repository.js`, `src/services/content.service.js`, `src/services/contentApproval.js`: scoped reads and approval/integrity checks.
- `test-fixtures/canonical.js`, `tests/fidelity.test.js`, `tests/persistence.test.js`: synthetic storage and fidelity regression coverage.
- `../frontend/tests/reader-fidelity.test.mjs`: response/render fidelity.

Modified:

- Backend `package.json`/lockfile: fidelity commands and isolated MongoDB test dependency. Installation also updates the already tracked `node_modules/.package-lock.json`; installed modules are not source changes to commit.
- `scripts/review-source-warnings.js`: optional read-only return mode, preserving existing review behavior.
- `scripts/import-canonical.js`: disabled-write guard without database imports.
- `scripts/check-read-api.js`: implemented supporting routes and edition-aware DTO checks.
- Book/Chapter/Verse models: exact strings, edition identities, unresolved references/completeness.
- App, book controller/routes, error middleware: thin read handlers and sanitized errors.
- `tests/read-api.test.js`: retained assertions plus the extended publication/response contract.
- Frontend API adapter, Testament contracts and declaration types: backend envelopes and faithful supporting/reference data.
- Reader ChapterReader/MarginNotes/VerseList: multiple notes, uncertainty/missing-text notices, whitespace preservation.
- Existing ingestion/API and frontend architecture documents: current handoff links/corrections.

Untouched: parser/reconciliation behavior, original ingestion tests, all data/source files, historical extractions, source-warning evidence, backend server/connection configuration, frontend routes/assets/styles/mock wording. An unrelated whitespace-only edit observed in `scripts/extract-manuscript.js` was preserved and is outside this change.

Repository debt: `.env` and installed backend modules were already tracked because `,gitignore` is not recognized by Git. Adding `.gitignore` does not untrack them or remove history. Credential/dependency-history cleanup requires a separate scoped review; checks did not print credentials.

## Next approval step

Subsequent editorial review recorded the author's preservation decisions for all 206 findings. Candidate **human-testament-0.1.0-rc.1** now freezes the unchanged draft payloads, decision record and fresh validation evidence; see [CANDIDATE_EDITIONS.md](CANDIDATE_EDITIONS.md) for its manifest hash and integrity checks. Canonical/import approval remains outstanding. The earlier verification results above describe the technical handoff, not an approval of this candidate.

The author has accepted preservation with the uncertainty recorded, including missing texts, inferred anchors, invalid citations and dash spacing. The candidate has its own version; the inherited manuscript identifier and meaningful whitespace/paragraphs remain unverified against page images. Any subsequent content or decision change requires a new frozen candidate. Explicit approval of the exact candidate manifest hash is still required before producing an approved import artifact.

After approval, separately implement/review a transactional idempotent importer that verifies actual artifact/source hashes, validates every record/relationship and issue decision, installs indexes deliberately, and reconciles stored content against the approved dataset before publication. Keep writes disabled until authorization. Then rerun positive live-content comparisons and real-browser checks. Parsing and synthetic persistence do not establish editorial correctness.
