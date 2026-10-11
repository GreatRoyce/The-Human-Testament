# Source warning review

The passing ingestion state was preserved in commit `afc4409`. The parser was not changed during this review. The remaining 206 warnings describe manuscript or clean-edition uncertainty; they do not imply a failing ingestion pipeline.

Every warning now has an evidence record in [SOURCE_WARNING_REVIEW.json](SOURCE_WARNING_REVIEW.json), including original-PDF page numbers, source fragments or reference inventories, the reason it remains open, and `editorialDecision: PENDING_AUTHOR_REVIEW`. Zero manuscript corrections were justified by this inspection, so none were applied. No approved import artifact was created.

## Evidence checked

The original PDF SHA-256 matches the validation report. Direct character-layer inspection found all 3,905 source references and all 1,470 notes. All 3,874 authored verses and all 1,470 note bodies/citation lines match the existing drafts after whitespace is removed on both sides. The original 1,439 footnote markers agree with the explicit anchors. All 31 unresolved references have no authored body text in the PDF at the pages recorded by the validation report.

This is a character-preservation check using the existing `pdf-parse` dependency and the known layout of this exact PDF. It is not a second-extractor word-token comparison or a page-image review. Whitespace normalization cannot determine the intended spaces at line boundaries. It also cannot certify the truth, editorial correctness, or intended meaning of manuscript statements.

| Warning | Records | Evidence and disposition |
| --- | ---: | --- |
| Missing source text | 31 | PDF references are empty. Obtain text from the author or an explicit decision to preserve an intentional omission. |
| Inferred note anchors | 31 | Notes exist without original markers confirming these anchors. The author must confirm or replace each probable anchor. |
| Invalid cross-reference targets | 3 | Source citations and target-chapter reference inventories confirm the broken targets. No unambiguous replacement is established. |
| Repeated passages | 67 | Both occurrences exist in the original PDF, with matching non-whitespace characters. Retain both pending author confirmation. |
| Legacy book-name citations | 24 | The original notes themselves name Seeker or Responsibility. A current See also link does not authorize rewriting prose or changing its verse number. |
| Punctuation review | 1 | Original PDF examples retain the reported punctuation. Whether it is intentional requires editorial judgement. |
| Inferred dash joins | 49 | The indicated dash is at the original line boundary. The PDF cannot establish the intended spacing. Retain the inference flags. |

Notes 104, 490, and 1191 still cite the nonexistent targets `Inquiry 1:13`, `Inquiry 4:13`, and `Relationships 1:16`. Their respective target chapters contain 12, 12, and 14 source references. The prior report-count correction is already committed; no further citation correction is supported by source evidence alone.

## Reproduce the evidence packet

From `backend/`, run `npm run source:review`. This reads the existing ten data files and writes only `docs/SOURCE_WARNING_REVIEW.json`. It rechecks every input hash before writing. The packet is regenerable evidence; put approved human decisions in a separate durable editorial decision record so regeneration cannot overwrite them. If the PDF layout or source hashes change, review the inspection rules and discrepancies before trusting a new packet.

## Approval remains separate

The evidence pass is complete; editorial decisions remain open. Matching the source does not resolve missing content, intended citations, repeated passages, anchors, or punctuation. Record an author's decision and its evidence for every open finding, including explicit acceptance when source uncertainty will remain. Only after that review and an explicit approval should a versioned approved import artifact be created and a controlled importer enabled. `canonical-content.json` remains the empty scaffold, both drafts remain `REVIEW_REQUIRED`, and database writes remain disabled in the verification workflow.
