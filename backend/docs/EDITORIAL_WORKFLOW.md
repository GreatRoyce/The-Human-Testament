# Author review workflow

This review classifies the existing 206 source findings. It does not rewrite the parser, manuscript, clean editions, drafts, or report, and it never connects to a database.

## Review files

- [EDITORIAL_REVIEW.md](EDITORIAL_REVIEW.md): every finding, grouped into seven classifications; 31 missing-text cases retain their separate probable-anchor decisions.
- [REPEATED_PASSAGES.md](REPEATED_PASSAGES.md): all 67 identical verse pairs, exact wording in both columns, and PDF page references. The 134 printed occurrences remain present.
- [EDITORIAL_REVIEW.json](EDITORIAL_REVIEW.json): complete structured classification, exact note/verse strings, source evidence, candidate relationships, and decision snapshots.
- [AUTHOR_DECISIONS.json](AUTHOR_DECISIONS.json): durable human decisions, bound to every finding fingerprint and all ten data-file hashes. It is created once and never overwritten by regeneration.
- [SOURCE_WARNING_REVIEW.json](SOURCE_WARNING_REVIEW.json): existing original-PDF evidence; the new preparation script rechecks the PDF in read-only mode rather than replacing this evidence packet.

The user explicitly identified themselves as the author. That statement establishes the role for this conversation; it does not accept any manuscript finding. The question about passage groups was a clarification request, not approval. No decision may be inferred from silence, a recommended option, a thematic match, or technical test success.

## Findings requiring attention

All 206 findings now have explicit author decisions; none is pending. The author accepted preservation of all source uncertainty, confirmed the 67 repeated pairs as intentional, and accepted the three broken citations with invalid flags retained. `AUTHOR_FINDINGS_REVIEWED` describes this completed decision record. The ingestion draft remains `REVIEW_REQUIRED`, and `importApproved` remains false. These decisions do not certify every statement as editorially correct or approve a canonical edition.

| Classification | Findings | Current treatment |
| --- | ---: | --- |
| Source omission | 31 | Author accepted preservation with text absent and uncertainty retained; intentional omission is not confirmed. |
| Unconfirmed relationship | 31 | Author accepted retaining inferred anchors and marker absence; anchor correctness is not confirmed. |
| Broken citation | 3 | Author explicitly accepted the original citations as printed; retain all invalid-target flags. No replacement was authorized. |
| Source-attested repetition | 67 | Author explicitly confirmed all 67 as intentional; preserve all 134 printed occurrences. |
| Legacy citation | 24 | Author accepted original names/addresses with unverified mapping and review flags retained. |
| Printed punctuation | 1 consolidated | Author accepted current rendering; retain every character and source observations. |
| Uncertain spacing | 49 | Author accepted current joins with uncertainty retained; intended spaces remain unproven. |

The three missing targets are Inquiry 1:13 (note 104), Inquiry 4:13 (note 490), and Relationships 1:16 (note 1191). Their current chapters contain 12, 12, and 14 references respectively. The index repeats each invalid target. The author clarified: "Yes—accept as printed and keep invalid flags". This accepts preservation of the citations, not validity of their absent targets. Proposed thematic alternatives remain expressly unapproved; neither semantic similarity nor changing to the nearest valid number establishes intention.

Society 42:4 has an authored counterpart at Society 43:4. Identity 13:4 has one at Identity 14:4. The nearly repeated chapter structures support presenting those counterparts to the author, not copying them automatically. Identity 13:25 and 14:25 differ by "neither" and must remain distinct.

Of the 24 legacy-citation notes, 20 retain Seeker with the same chapter/verse numbers as their current Inquiry links; four cite Responsibility at addresses different from their current Freedom links. No historical edition establishes a verified title/number migration. Note 490 also has one of the three invalid targets. Two additional editorial observations within the existing legacy findings need author judgement: note 1314 discusses death/rank while its Freedom 27:11 target discusses courage in inquiry; note 1367 discusses learning on one's own behalf while Freedom 25:3 discusses natural motives without unseen forces. These observations do not change the pipeline warning count or prove a correction. Full original note/target text appears in the review packet.

## Recording actual decisions

For a non-pending decision, record its status, exact author response, named/self-identified reviewer, date, action and rationale. Accepted preservation does not prove an intentional repetition unless the action explicitly confirms that intention. A correction request remains open until a separately authorized source revision is supplied and checked. Deferred findings remain open.

Do not promote an inferred source anchor to `sourceMarkerPresent: true` following author confirmation: the original PDF still lacks that marker. Author confirmation is a new editorial fact to record separately. Missing wording and note anchoring require separate decisions.

Any supplied verse wording must be quoted exactly from the author and reviewed as a proposed new edition. Do not inject it automatically into the original PDF/TXT/draft. Likewise, changing a citation may require coordinated changes to note prose, its See also line, and its index entry; record the complete proposed scope first.

This decision record never grants import approval. Source warnings may remain in the original evidence even when the author explicitly accepts them. Preserve that audit trail instead of forcing the parser warning count to zero.

The author decisions and source findings are frozen with candidate `human-testament-0.1.0-rc.1`. See [CANDIDATE_EDITIONS.md](CANDIDATE_EDITIONS.md) for its identity, integrity checks and separate canonical/import approval boundary. Later changes to this working decision record require a new candidate version; never update the frozen copy in place.

## Reproduce and verify

From `backend/`:

```text
npm run editorial:prepare
npm run editorial:check
npm run ingestion:check
npm test -- tests/editorial-review.test.js tests/ingestion.test.js
```

Preparation reads the master PDF and source files, validates all source/finding bindings, and regenerates only the three review outputs. Existing author decisions are read and preserved. Stale source hashes, missing/duplicate finding slots, altered fingerprints, unconfirmed reviewers and incomplete substantive decisions fail validation.

`editorial:check` repeats the evidence/classification and compares the three saved outputs without writing anything. If an actual author decision has been recorded, regenerate the review outputs before checking them. No database or importer is involved.

Regression coverage checks all-finding coverage, exact repeated strings, unapproved candidates, missing-text/anchor separation, loss/staleness of decisions, source binding, and prevention of implicit intention/approval. PDF evidence still excludes whitespace, page-image review and a second extractor; it cannot certify dash spacing or authorial intent.
