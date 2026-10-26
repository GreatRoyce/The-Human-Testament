# Human Testament candidate 0.1.0-rc.1

Edition ID: **human-testament-0.1.0-rc.1**. Frozen 2026-10-11T21:33:48.537Z (calendar date 2026-10-11, Africa/Lagos).

This candidate is a frozen snapshot of the canonical and supporting working drafts plus their review evidence. It is distinct from the master PDF. The payloads retain their exact draft bytes and inherited, unverified sourceVersion; candidate identity comes from manifest.json.

Validation: 32 fidelity checks passed; 524 structural comparisons; 31 regression tests passed. Ingestion remains REVIEW_REQUIRED, with 206 warnings. All 206 author decisions are recorded; 0 findings await a decision.

No canonical import or publication is approved. The three invalid citations, 31 missing texts, 31 inferred anchors, legacy mapping flags, punctuation observations and 49 spacing uncertainties remain recorded. All 67 intentional repeated pairs are preserved. PDF whitespace/layout and page-image fidelity remain unverified.

## Files and integrity

Content is in content/, author decisions and findings in editorial/, and executed checks in validation/. All ten original source/draft hashes and their roles are recorded in manifest.json; the master PDF is referenced by hash, not copied or replaced. Source files remain in backend/data/.

manifest.sha256 seals manifest.json, whose artifact hashes cover every other snapshot file. This detects drift; it is not a digital signature or operating-system write lock. Retain the manifest hash independently. Do not edit this directory or overwrite this version; create a new version for every change.

From backend/: `npm run candidate:check -- --version 0.1.0-rc.1`. To anchor verification externally, append `--manifest-sha256 <recorded-hash>`. Checking uses this snapshot only, so later draft edits do not invalidate the frozen candidate.

## Original file identities (SHA-256)

| Original path | SHA-256 |
| --- | --- |
| data/The-Human-Testament-Clean-Ingestion-Edition.txt | 5471d6e58948a2427cac6ca2f5f1288422f0b6f5be15b429007653ef415460c8 |
| data/The-Human-Testament-Ingestion-Validation-Report.md | a67e078b8f477e7ad95c1f263cb34bafe8975a02384c2b52766f60f4c15fa7ed |
| data/The-Human-Testament--Complete-Manuscript.pdf | bbdd152c8b870862b44214dbd56059fa2a85146e6f1ad1e4d48f1d5c7fa34c76 |
| data/The-Human-Testament-Clean-Ingestion-Edition.docx | b594c94c58ceb040bdddb9f5c7f8303a3fa53d172b6d6897642d846d007d6cf2 |
| data/canonical-content.json | 44c73a7421cf082ce50ee9d1df972167d8e67cb6f5b82c3a929afed73671a746 |
| data/manuscript-extracted-original-pdf.txt | 9d696769b8fedafe23159de927c2f7b5f3a83c4f42c4b3db25ed3156e1986af0 |
| data/manuscript-extracted.txt | 1840376156b697eb940377bc171642609820debd646145eb02b5885b429abe20 |
| data/canonical-content.draft.json | 3e1b9620ce9f3fca9a7c6ecef9baa06f497465eaaa1631a94d28184e2af39bb1 |
| data/supporting-material.draft.json | 1e57d015b16a0c8502cae6666b1909b268aec85dac4745df268807044968cb3f |
| data/ingestion-report.json | f0e93310e1a446888ee10427ef759f72665e033bc88ee7b6c4fc48012b80dc00 |
