# Frozen candidate editions

The first frozen candidate is **human-testament-0.1.0-rc.1**, version **0.1.0-rc.1**, in `backend/editions/human-testament-0.1.0-rc.1/`. Its manifest is the candidate's identity record; `manifest.sha256` records its SHA-256. This is a candidate identifier assigned during freezing, not a verified manuscript date or canonical release approval.

Frozen on **2026-10-11**, at **22:33:48 Africa/Lagos** (`2026-10-11T21:33:48.537Z`). Independently recorded manifest SHA-256:

```text
b8207096f76054487efa620b308b4a37ef799597c6a89b90aeb3b97f5ec9d308
```

Executed validation: **32 fidelity checks passed, 524 structural comparisons passed, 31 regression tests passed, zero ingestion errors, zero report inconsistencies**. All ten original source/data files remained byte-identical. The 206 original warnings remain visible and all 206 have explicit author preservation decisions.

The master PDF remains the manuscript authority. The clean TXT/DOCX are working representations; the existing drafts are mutable generated representations. The frozen candidate copies the canonical and supporting drafts byte for byte into explicitly named candidate files, and snapshots their validation evidence and author decisions. Their inherited `sourceVersion: 2024-07-09` stays unchanged and unverified. The enclosing candidate manifest supplies the new version without rewriting source provenance or prose.

## Snapshot contents

```text
editions/human-testament-0.1.0-rc.1/
  README.md
  manifest.json
  manifest.sha256
  content/
    canonical-content.candidate.json
    supporting-material.candidate.json
  editorial/
    AUTHOR_DECISIONS.json
    EDITORIAL_REVIEW.json
    EDITORIAL_REVIEW.md
    REPEATED_PASSAGES.md
    SOURCE_WARNING_REVIEW.json
  validation/
    ingestion-report.json
    source-validation-report.md
    fidelity-results.json
    regression-tests.tap
```

The manifest records the SHA-256, byte size and role of all ten original source/draft files, including the master PDF; hashes of validation scripts, tests and dependency configuration; every snapshot artifact hash; the runtime; fresh validation results; and outstanding edition decisions. The master PDF and other large sources are referenced by hash, not duplicated or overwritten. The snapshot stores the original evidence packet alongside the newer author decisions; its historical pending labels do not override the explicit author record.

## Editorial and approval state

All 206 findings have explicit author preservation decisions: 67 intentional repeated pairs, three broken citations, 31 missing texts, 31 inferred anchors, 24 legacy citations, one consolidated punctuation finding and 49 dash joins. No finding awaits an author response. Preservation retains the source uncertainty; the three missing targets remain invalid, text remains absent and inferred anchors remain inferred.

Ingestion remains `REVIEW_REQUIRED`; the candidate is `CANDIDATE_REVIEW_REQUIRED`, with `importApproved: false` and `published: false`. Explicit canonical/import approval of the exact frozen manifest hash is outstanding. Meaningful PDF whitespace/paragraph layout, page-image review and an independent second extraction remain unverified. Technical validation and the author's preservation decisions do not certify every manuscript statement or grant release approval.

## Create and verify

From `backend/`:

```text
npm run candidate:freeze -- --version 0.1.0-rc.1
npm run candidate:check -- --version 0.1.0-rc.1
npm run candidate:check -- --version 0.1.0-rc.1 --manifest-sha256 <independently-recorded-hash>
```

In Windows PowerShell, use `npm.cmd` in these commands so the `--version` argument reaches the script rather than being consumed by the `npm.ps1` wrapper.

Freezing first validates source/decision hashes, runs read-only ingestion, fidelity and editorial checks, then executes the focused ingestion/editorial/fidelity/candidate tests. It rechecks inputs before and after snapshot creation. Failed validation cannot produce a sealed candidate. An interrupted write can leave an incomplete directory; it must not be treated as frozen or overwritten silently. Checking requires the complete inventory and seal.

The freeze command refuses an existing edition directory. Never edit or regenerate a frozen snapshot; create a new candidate version for changed content, decisions or evidence. The check command reads only the frozen snapshot and does not depend on later working-draft state. The checksums detect drift; they are not digital signatures or filesystem write protection. Keep the manifest hash independently so coordinated changes to the manifest and its sidecar can also be detected. No production database operation or import is performed.
