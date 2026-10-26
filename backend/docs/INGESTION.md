# Manuscript ingestion and review

The following describes the original ingestion stage. For the subsequent storage/API schemas, direct PDF fidelity checks, disabled-write importer, and current test results, see [Canonical content fidelity handoff](CANONICAL_CONTENT_PIPELINE.md). Manuscript/data files and the parser remain unchanged in that subsequent stage.

The clean TXT is the parser input. The Markdown validation report supplies the expected counts, missing-reference identities, probable note anchors, repeated passages, and other documented review findings. Parsing reconciles these sources; it does not approve the manuscript or import it into a database.

## Commands

Run from `backend/`:

```sh
npm run ingestion:check
npm test
npm run ingestion:draft
```

`ingestion:check` reads and validates without writing any files. `ingestion:draft` regenerates only `data/canonical-content.draft.json`, `data/supporting-material.draft.json`, and `data/ingestion-report.json`. Paths resolve relative to the script, independently of the process working directory. Neither command loads the application, connects to MongoDB, or invokes the importer.

Exit code 0 means the ingestion reconciles with the report. It does **not** mean the source is error-free or approved. Known findings produce `REVIEW_REQUIRED`, `approvalStatus: DRAFT_REVIEW_REQUIRED`, and `importApproved: false`. Parsing failures or mismatches produce `INGESTION_FAILED` and exit code 1. When validation completes with errors, draft mode still writes diagnostic outputs marked as failed; these are not importable data.

## Reconciled inventory

| Item | Count |
| --- | ---: |
| Books | 10 |
| Chapters | 230 |
| Source verse references | 3,905 |
| References containing authored verse text | 3,874 |
| Unresolved references with no source text | 31 |
| Supporting notes | 1,470 |
| Notes with original footnote markers | 1,439 |
| Notes with inferred anchors | 31 |
| Note See also entries | 72 |
| Cross-reference index entries | 72 |
| Glossary entries | 38 |

All 31 empty references match section 6.1 by identity. The current TXT also contains 31 missing-text flags; the earlier tally of 30 is not reproducible from this input. The final empty reference is `Purpose 3:16`: clean TXT line 11778, flag line 11779, original PDF page 542, probable note 1467. It remains unresolved rather than becoming a verse containing editorial text. The report records this reconciliation for every empty reference.

The report includes 524 comparisons and accounts for all 11,618 nonblank TXT lines. Blank spacing is not canonical content. No new independent PDF text comparison was performed: the 92,156 matching word tokens are explicitly attributed to the supplied validation report, with `verifiedByThisParser: false`. The original PDF's SHA-256 is checked against that report.

## Draft records and provenance

- `canonical-content.draft.json`: authored books, chapters, and verses; separate `unresolvedReferences`. Chapter `referenceCount` includes missing references, while `verses` contains authored text only. Verse text retains the exact source lines joined with newlines, including existing punctuation and repeated passages. Reference addresses and headings are structural metadata.
- `supporting-material.draft.json`: all notes, separate cross-references, index entries, glossary records, supporting sections, front/back matter, and editorial apparatus. Source line numbers and raw source text are retained. Notes keep their original marker and full raw text as well as structured prose/type fields.
- `ingestion-report.json`: expected and actual counts, comparisons, line accounting, complete reference inventory, missing-reference reconciliation, source findings, validation-report findings, and ingestion errors.

Note anchors explicitly distinguish `explicit` from `inferred`. `sourceMarkerPresent`, `evidence`, `referenceExists`, `authoredTextExists`, `indexCorroborated`, and `reviewRequired` preserve why an anchor is believed and what remains uncertain. Index corroboration never promotes an inferred anchor to explicit or approved. A note's own `reviewReasons` also covers invalid citation targets and legacy book names independently of its anchor status.

Cross-reference targets distinguish `resolved`, `unresolved_source_text`, `missing_reference`, and `invalid_format`. Lookup keys may be normalized; original citation text is preserved. Index entries link to matching note numbers rather than becoming canonical verses. Supporting content remains separate even when its anchor has no authored verse text.

Both drafts carry schema version 2, input/report hashes, the protected-file hash manifest, and review/ingestion status. `sourceVersion` is inherited from the existing scaffold (`2024-07-09`); this is not a newly verified manuscript date or editorial approval.

## Findings that remain open

The reconciled snapshot contains 206 source-review findings:

- 31 missing authored texts;
- 31 inferred note anchors;
- 3 invalid cross-reference targets (notes 104, 490, and 1191);
- 67 exact repeated-passage groups, retained at every original address;
- 24 notes citing legacy book names, retained without rewriting;
- one consolidated punctuation-review finding containing the report's original observations;
- 49 inferred em-dash joins documented in the clean-edition report.

Section 6.2 originally described Relationships chapter 1 as having 15 verses, contradicting section 4 and the clean TXT. On 2026-10-11 the original PDF was checked directly: page 369 contains references 1:1 through 1:13, page 370 contains 1:14, and chapter 2 begins on page 371. Section 6.2 was corrected to 14, with a correction note in the report. No manuscript text or reference was changed. The cited `Relationships 1:16` remains invalid and flagged. The regenerated snapshot has 206 source warnings, zero validation-report issues, and zero ingestion errors. Contradiction detection remains covered by a regression test. Warning totals represent findings/groups, not a count of every possible punctuation occurrence.

## File safety

All ten existing `data/` files remain at their current paths. No originals or backups are deleted or moved. Seven protected files are hashed and rechecked before any draft write:

- Original manuscript PDF;
- Clean ingestion TXT and DOCX;
- Markdown validation report;
- `canonical-content.json`;
- Both `manuscript-extracted*.txt` backups.

The importer still reads `canonical-content.json`, which remains the original empty scaffold. The existing extraction scripts, importer, models, routes, and frontend are unchanged by this ingestion repair. The only deliberate source-document change is the documented count correction in the Markdown validation report; its updated hash is recorded in regenerated drafts. Directory reorganization is deferred until all dependent paths are deliberately migrated.

## Implementation and verification

`scripts/parse-clean-manuscript.js` coordinates inputs, provenance, validation, and the three allowed outputs. `scripts/ingestion/parse-manuscript.js` classifies source content; `read-validation-report.js` extracts report expectations; `validate-manuscript.js` reconciles identities and records review findings. No database code is involved in these modules.

The tests cover the complete corpus and corrupted inputs: exact verse/note preservation, all missing-reference identities, inferred-anchor uncertainty, invalid citations, repeated passages, legacy names, glossary/index records, line accounting, misplaced editorial flags, missing markers, incorrect anchors, duplicate references, lost notes, and malformed report conventions. The CLI read-only test runs outside the backend working directory and verifies all ten data files remain byte-identical.

## Next approval boundary

Human review must decide how missing text, inferred anchors, invalid/legacy citations, repetitions, punctuation, and inferred joins should be handled. Preserve those decisions as an auditable review record. Before any import, align the importer and storage model with schema version 2, including unresolved references and supporting material, and validate the candidate again. Replacing `canonical-content.json` and performing a controlled database import require a separate deliberate approval; neither happens in this pipeline.
