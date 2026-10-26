# The Human Testament — Clean Ingestion Edition: Validation Report

Generated 2026-10-11. Source: `The-Human-Testament--Complete-Manuscript.pdf` (550 pages, LibreOffice 24.2 export, SHA-256 `bbdd152c8b870862b44214dbd56059fa2a85146e6f1ad1e4d48f1d5c7fa34c76`). The original file was only read, never modified; its hash after processing is identical to the hash before.

Report correction (2026-10-11): In section 6.2, the description of Relationships chapter 1 was corrected from 15 to 14 verse references after checking the original PDF: references 1:1 through 1:13 appear on page 369, reference 1:14 appears on page 370, and chapter 2 begins on page 371. This agrees with the chapter table in section 4. The manuscript is unchanged; the target Relationships 1:16 remains invalid and open for review.

## 1. Summary

| Item | Count |
|---|---|
| Books | 10 |
| Chapters | 230 |
| Verse references | 3905 |
| Verses with text | 3874 |
| Verse references with **no text in the source** | 31 |
| Supporting-material notes (footnotes) | 1470 |
| Notes linked to a verse by a footnote marker | 1439 |
| Notes with no marker in the source (probable anchor inferred, flagged) | 31 |
| "See also" cross-references inside notes | 72 |
| Cross-Reference Index entries | 72 |
| Glossary entries | 38 |

**Overall result:** The structure is fully consistent. Every book, chapter and verse reference is in sequence, with no gaps, duplicates or malformed references. The text is complete: an independent word-for-word comparison against a second PDF text extractor (`pdftotext`) found the same 92,156 word tokens on both sides, with nothing missing and nothing added. The edition is **not** fully clean, because the source itself has defects. 31 verse references have no verse text, 31 notes have no marker, 3 cross-references point to verses that do not exist, several passages are repeated, and 24 notes cite old book names. These are listed below and flagged in the edition. Nothing has been supplied or corrected.

## 2. Output files (`The_Human_Testament/backend/data/`)

| File | Purpose |
|---|---|
| `The-Human-Testament-Clean-Ingestion-Edition.docx` | Primary deliverable. Every line is its own paragraph with a named style, listed in §3. |
| `The-Human-Testament-Clean-Ingestion-Edition.txt` | UTF-8 text with the same line sequence as the DOCX. Blank lines are spacing only. |
| `The-Human-Testament-Clean-Ingestion-Edition.pdf` | Text-based PDF rendered from the DOCX, for reading. Its page numbers are **not** the source page numbers. |
| `The-Human-Testament-Ingestion-Validation-Report.md` | This report. |

No database import file was produced. Section 6 lists open items that need a human decision first.

## 3. Structural conventions for the parser

The DOCX and the TXT contain the same 11,618 non-blank lines in the same order. Both were checked programmatically.

| DOCX paragraph style | Content | TXT pattern |
|---|---|---|
| Editorial Marker | Editorial apparatus. **Not author text.** It marks sections and note anchors. | line starts `[[` and ends `]]` |
| Editorial Flag | A source defect that needs human review. **Not author text.** | `[[FLAG: …]]` |
| Front Matter Heading / Front Matter Text / Contents Entry | Half-title, title page, dedication, To the Reader, Contents | inside the `[[FRONT MATTER: …]]` blocks; Contents entries are `Entry<TAB>page` |
| Heading 1 | Book title, e.g. `INQUIRY` | title line inside the canonical region |
| Book Subtitle | Book subtitle | line after the book title |
| Heading 2 | `CHAPTER n` | `^CHAPTER \d+$` |
| Verse Reference | `c:v` | `^\d+:\d+$` |
| Verse Text | Verse text, with layout line-wraps joined | line after a reference |
| Supporting Material Heading | `Supporting Material` (one per chapter, after its verses) | literal line |
| Note Text | `Label. text` (label is bold in the DOCX) | line after a `[[Note n · c:v]]` marker |
| See Also | `See also: …` belonging to the preceding note | `^See also:` |
| Back Matter Heading / Back Matter Text / Back Matter Closing Line | Untitled closing text (p. 544), index and glossary headings | inside the `[[BACK MATTER: …]]` blocks |
| Index Entry / Index See Also | `Book c:v` / `See also: …` | pairs of lines |
| Glossary Term / Glossary Definition / Glossary Book Tag | Term / definition / `(Book)` attribution | triples of lines |

The canonical region starts at `[[CANONICAL BOOKS BEGIN]]` and ends at `[[CANONICAL BOOKS END]]`. Nothing outside it is a verse. Note markers read `[[Note n · c:v]]`, where *n* is the footnote number in the original and *c:v* is the verse that carries the marker. The note always sits in the same book and chapter as that verse. The superscript footnote numbers were taken out of the verse text, so verse text is clean. The link is kept in the marker line. All 1,439 markers fall at the very end of their verse, so no position information is lost.

## 4. Books, chapters and verse counts

| # | Book | Subtitle | Source pp. | Chapters | Verses | Empty refs | Notes |
|---|---|---|---|---|---|---|---|
| 1 | INQUIRY | Doubt, Evidence, and the Discipline of Asking | 6–66 | 41 | 560 | 1 | 209 |
| 2 | FREEDOM | Liberty, Responsibility, and the Price of Choice | 67–162 | 34 | 633 | 11 | 257 |
| 3 | POWER | Authority, Judgment, and the Measure of Rule | 163–200 | 21 | 268 | 1 | 111 |
| 4 | SOCIETY | Culture, Institutions, and the Education of a People | 201–318 | 43 | 833 | 7 | 290 |
| 5 | IDENTITY | Self, Character, and the Making of a Person | 319–367 | 14 | 342 | 7 | 107 |
| 6 | RELATIONSHIPS | Love, Desire, and the Bonds Between Us | 368–447 | 39 | 563 | 1 | 220 |
| 7 | HUMANITY | Contradiction, Nature, and the Human Condition | 448–480 | 15 | 292 | 1 | 119 |
| 8 | EXISTENCE | Death, Origins, and the Unknown | 481–495 | 4 | 98 | 0 | 32 |
| 9 | BELIEF | Gods, Faith, and the Question of the Sacred | 496–531 | 16 | 228 | 1 | 99 |
| 10 | PURPOSE | Ambition, Contentment, and a Meaningful Life | 532–543 | 3 | 88 | 1 | 26 |
| | **Total** | | | **230** | **3905** | **31** | **1470** |

Verses per chapter (chapter: verses). Every chapter is numbered continuously from 1, and every chapter's verses run from c:1 to c:N with no gaps or repeats:

- **INQUIRY**: 1: 12, 2: 10, 3: 11, 4: 12, 5: 12, 6: 12, 7: 11, 8: 8, 9: 10, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 11, 16: 10, 17: 11, 18: 9, 19: 9, 20: 9, 21: 9, 22: 10, 23: 9, 24: 10, 25: 10, 26: 12, 27: 9, 28: 10, 29: 17, 30: 24, 31: 24, 32: 24, 33: 30, 34: 20, 35: 20, 36: 20, 37: 20, 38: 20, 39: 20, 40: 20, 41: 20
- **FREEDOM**: 1: 16, 2: 16, 3: 13, 4: 6, 5: 16, 6: 13, 7: 16, 8: 12, 9: 7, 10: 18, 11: 9, 12: 14, 13: 14, 14: 13, 15: 14, 16: 13, 17: 7, 18: 22, 19: 25, 20: 20, 21: 27, 22: 30, 23: 20, 24: 22, 25: 25, 26: 22, 27: 25, 28: 28, 29: 18, 30: 25, 31: 27, 32: 23, 33: 27, 34: 30
- **POWER**: 1: 13, 2: 14, 3: 13, 4: 13, 5: 13, 6: 12, 7: 7, 8: 13, 9: 12, 10: 13, 11: 12, 12: 12, 13: 12, 14: 12, 15: 6, 16: 6, 17: 6, 18: 28, 19: 8, 20: 20, 21: 23
- **SOCIETY**: 1: 12, 2: 13, 3: 12, 4: 14, 5: 18, 6: 6, 7: 13, 8: 7, 9: 13, 10: 6, 11: 12, 12: 25, 13: 12, 14: 18, 15: 6, 16: 12, 17: 12, 18: 6, 19: 27, 20: 28, 21: 24, 22: 29, 23: 22, 24: 30, 25: 26, 26: 25, 27: 20, 28: 18, 29: 20, 30: 22, 31: 25, 32: 26, 33: 26, 34: 26, 35: 25, 36: 24, 37: 26, 38: 28, 39: 17, 40: 12, 41: 30, 42: 30, 43: 30
- **IDENTITY**: 1: 17, 2: 10, 3: 25, 4: 24, 5: 30, 6: 30, 7: 30, 8: 23, 9: 21, 10: 27, 11: 25, 12: 20, 13: 30, 14: 30
- **RELATIONSHIPS**: 1: 14, 2: 13, 3: 13, 4: 13, 5: 13, 6: 13, 7: 6, 8: 13, 9: 14, 10: 12, 11: 12, 12: 13, 13: 13, 14: 13, 15: 7, 16: 7, 17: 6, 18: 7, 19: 13, 20: 7, 21: 6, 22: 7, 23: 6, 24: 7, 25: 7, 26: 7, 27: 30, 28: 10, 29: 10, 30: 25, 31: 25, 32: 20, 33: 28, 34: 29, 35: 21, 36: 24, 37: 22, 38: 27, 39: 30
- **HUMANITY**: 1: 18, 2: 19, 3: 20, 4: 19, 5: 18, 6: 20, 7: 19, 8: 21, 9: 18, 10: 20, 11: 18, 12: 23, 13: 28, 14: 16, 15: 15
- **EXISTENCE**: 1: 23, 2: 25, 3: 27, 4: 23
- **BELIEF**: 1: 13, 2: 13, 3: 9, 4: 15, 5: 21, 6: 27, 7: 12, 8: 12, 9: 10, 10: 12, 11: 10, 12: 10, 13: 12, 14: 12, 15: 15, 16: 25
- **PURPOSE**: 1: 30, 2: 29, 3: 29

## 5. Validation checks

| # | Check | Method | Result |
|---|---|---|---|
| 1 | Comparison with the original PDF | Word positions and fonts were extracted from every page with pdfplumber. All 92,156 word tokens were cross-checked against an independent `pdftotext` extraction (digits and line-wrap hyphen and dash splits normalised on both sides). 12 pages were checked by eye against page images, see §7. | Pass. 0 missing, 0 extra tokens. |
| 2 | Book order | Book-title pages detected by their 17-pt title and compared with the Contents. | Pass. 10 books in the Contents order. All 12 Contents page numbers match the actual pages. |
| 3 | Chapter sequence | Every `CHAPTER n` heading (12-pt) checked for continuity within its book. | Pass. 230 chapters, all continuous from 1. |
| 4 | Unique verse references | Each c:v checked to match its chapter number and run c:1…c:N. | Pass. 3,905 references, 0 duplicates, 0 gaps, 0 malformed, 0 out of sequence. |
| 5 | Missing, duplicated or malformed references | As above, plus checks for verse references with no text. | 31 references have no text in the source (§6.1). |
| 6 | Text lost at page and column breaks | 206 verses continue across a page break and 463 continuation fragments were rejoined. Footnote continuations across columns and pages were rejoined the same way. The token cross-check confirms nothing was dropped. | Pass. |
| 7 | Supporting material kept | 1,470 notes (Reflection 527, Clarification 382, Context 299, Definition 262) and 72 "See also" lines. Footnote numbers 1–1,470 are continuous and unique. 1,439 markers match 1,439 notes one-to-one. | Pass, except the 31 notes with no marker (§6.1). |
| 8 | Duplication from running headers or overlapping text | All 528 running headers were removed by position (above the rule). Each was checked: the page number matched the real page, and the book or chapter named matched the content. | Pass. 0 header mismatches, 0 header text leaked into content. |
| 9 | Contents, glossary and index kept separate | All three sit outside the canonical region with their own styles. | Pass. |
| 10 | Cross-references | Every "See also" target checked to exist. All 72 index entries checked against the notes. | All 72 index entries match a note exactly. 3 targets do not exist (§6.2). |

## 6. Unresolved issues (human review required)

### 6.1 Verse references with no verse text, and notes with no marker

In 31 places the manuscript prints a verse reference with an **empty** text area. The page images confirm it; there is no hidden or white text. In each case exactly one footnote number has no marker anywhere in the text, and its position in the sequence falls in a range that contains only that empty verse. Each such note is therefore placed with the empty verse as a **probable** anchor and marked `PROBABLE ANCHOR`. For 3 of them (472, 404, 431), the original Cross-Reference Index lists a cross-reference from exactly that verse, which supports the inference. The verse text itself is missing from the source and has not been supplied.

| Book | Empty ref | Source page | Unmarked note | Note text | Index corroboration |
|---|---|---|---|---|---|
| Inquiry | 31:4 | 43 | 131 | Definition. Values a single incisive question above many routine, unquestioned answers. | — |
| Freedom | 19:13 | 102 | 317 | Reflection. Distinguishes the difficulty of leaving a place from the greater difficulty of leaving its lingering influence. | — |
| Freedom | 20:12 | 106 | 324 | Reflection. Distinguishes authority's power to command obedience from its inability to command truth. | — |
| Freedom | 22:5 | 113 | 342 | Definition. Places the burden of proof on whoever asserts universal guilt. | — |
| Freedom | 23:4 | 117 | 352 | Definition. Traces morality's origin to the practical requirements of cooperation rather than to revelation. | — |
| Freedom | 26:9 | 128 | 385 | Context. Rejects simple, fixed judgments of human nature as either wholly good or wholly corrupt. | — |
| Freedom | 28:5 | 135 | 401 | Context. Warns that treating belief as settled knowledge makes honest questioning harder to sustain. | — |
| Freedom | 28:11 | 136 | 404 | Definition. Reframes doubt as a possible doorway to understanding, echoing Seeker 18:2's treatment of doubt meeting certainty. | yes |
| Freedom | 30:4 | 144 | 421 | Definition. Notes that ideas and stories, not force alone, are often the true source of power. | — |
| Freedom | 30:12 | 145 | 424 | Clarification. Justifies examining every narrative on the grounds of its power, not its worthlessness. | — |
| Freedom | 31:4 | 148 | 431 | Reflection. Requires claims of divine approval to face the same scrutiny as any other claim, echoing Seeker 11:1. | yes |
| Freedom | 32:3 | 152 | 441 | Reflection. Distinguishes mere difference from superiority, tracing many injustices to their conflation. | — |
| Power | 1:12 | 164 | 472 | Reflection. Frames honesty as the condition love requires to grow, echoing Society 16:1’s treatment of truth. | yes |
| Society | 27:5 | 260 | 735 | Reflection. Lists trust and cooperation as requirements for a healthy society that are rarely formally assessed. | — |
| Society | 28:11 | 264 | 745 | Clarification. Distinguishes religion's pursuit of faith from education's pursuit of understanding. | — |
| Society | 32:14 | 279 | 778 | Clarification. Distinguishes history reduced to recollection from history that cultivates genuine understanding. | — |
| Society | 33:5 | 281 | 783 | Definition. Notes that beliefs often survive long after their origins have been forgotten. | — |
| Society | 34:5 | 285 | 791 | Context. Notes that political, religious, and national movements often seek legitimacy through appeals to history. | — |
| Society | 39:13 | 303 | 835 | Reflection. Requires responsibility to follow wherever a choice is actually made, not only where visibility exists. | — |
| Society | 42:4 | 311 | 853 | Reflection. Notes that fewer people examine their own contribution to a society's corruption than examine society's corruption itself. | — |
| Identity | 1:4 | 320 | 869 | Definition. Distinguishes inherited categories, garments, from the self they are placed upon. | — |
| Identity | 4:5 | 327 | 890 | Definition. Distinguishes geography's account of where something exists from its silence about what it becomes. | — |
| Identity | 5:3 | 330 | 898 | Reflection. Frames daily habits, such as greetings and obligations, as ongoing lessons in culture. | — |
| Identity | 6:3 | 335 | 906 | Reflection. Observes that ideas and stories now travel faster than merchants or armies once did. | — |
| Identity | 8:5 | 345 | 922 | Reflection. Values self-understanding above the defense of an inherited label. | — |
| Identity | 10:5 | 351 | 938 | Reflection. Recommends observing action over speech as the more reliable indicator of actual belief. | — |
| Identity | 13:4 | 360 | 962 | Reflection. Contrasts respect pursued through appearance with respect earned through character. | — |
| Relationships | 33:26 | 422 | 1144 | Clarification. Reframes the central question as one of underlying motive rather than the specific action taken. | — |
| Humanity | 14:5 | 477 | 1300 | Definition. Notes that no market survives without willing participants, including the audience that sustains a performer. | — |
| Belief | 4:12 | 504 | 1366 | Definition. Distinguishes desiring transformation from desiring the discipline required to produce it. | — |
| Purpose | 3:16 | 542 | 1467 | Definition. Locates human worth as independent of brand, status, or public approval. | — |

### 6.2 Cross-references to verses that do not exist

Each of these appears both in the note and in the Cross-Reference Index. They are kept exactly as written.

| Note | Anchored at | Says | Problem |
|---|---|---|---|
| 104 | Inquiry 26:12 | See also: 1:13 (index: Inquiry 1:13) | Inquiry chapter 1 has only 12 verses |
| 490 | Power 4:13 | See also: Inquiry 4:13 | Inquiry chapter 4 has only 12 verses |
| 1191 | Relationships 39:15 | See also: 1:16 (index: Relationships 1:16) | Relationships chapter 1 has only 14 verses |

### 6.3 Repeated passages in the source (kept, not removed)

These verse texts appear word-for-word in two places. They are on different pages and under different chapter numbers, with different footnotes, so this is repetition in the manuscript itself and not duplication caused by extraction. They are kept as written. The author should confirm whether the repetition is intended.

- **Society 42 and Society 43**: 29 of 30 verses identical (42:1–3 and 42:5–30 = 43:1–3 and 43:5–30). 42:4 is one of the empty references.
- **Identity 13 and Identity 14**: 28 verses identical (13:1–3, 13:5–24, 13:26–30 = 14:1–3, 14:5–24, 14:26–30). 13:4 is empty.
- **Freedom 34:23–30 and Society 41:23–30**: 8 identical verses.
- **Inquiry 41:3 = Society 41:2** and **Inquiry 41:6 = Society 41:4**.

### 6.4 Punctuation kept exactly as printed (possible typos, not corrected)

- `?;` in Inquiry 31:6 ("a life?; every"), Freedom 28:7 ("collapse?; these"), Identity 7:1 ("they are?; many")
- `.".` (full stop after a closing quotation) in Inquiry 32:3, 34:4, 39:13, Freedom 34:2, Society 41:12, and `?"; … ?".` in Identity 13:29/14:29
- Quotation marks and apostrophes are mixed: straight `'` and `"` alongside curly `’ “ ”`. Each is kept as printed.
- Dashes: verses mostly use an unspaced em dash (`word—word`). Notes mostly use a spaced one (`word — word`). Both are kept.

### 6.5 Line-wrap joins that needed a judgement

PDF line wraps were joined with a single space, except in two cases where a space would have been wrong.

- **43 hyphens at a line end** were joined **without** a space, e.g. `self-` + `deception` → `self-deception`. All are real compound hyphens. The PDF has no automatic hyphenation, so no hyphen was removed.
- **49 em dashes at a line boundary** (`word—` / `—word`) were joined without a space, following the unspaced style the verses use everywhere else. The PDF does not show whether a space existed at the break, so these are **inferred**:

  INQUIRY 29:16: `is—not`; INQUIRY 30:5: `both—and`; INQUIRY 31:7: `throne—examine`; INQUIRY 31:12: `permitted—ask`; FREEDOM 18:15: `power—wisdom`; FREEDOM 18:19: `limits—wisdom`; POWER 20:11: `it—legitimacy`; SOCIETY 20:15: `works—wisdom`; SOCIETY 22:9: `verification—the`; SOCIETY 22:12: `true—the`; SOCIETY 22:14: `forgotten—selection`; SOCIETY 22:18: `achievable—is`; SOCIETY 23:3: `imagined—stories`; SOCIETY 23:6: `narratives—some`; SOCIETY 23:15: `awareness—awareness`; SOCIETY 23:19: `generations—a`; SOCIETY 25:13: `broken—this`; SOCIETY 27:3: `awareness—awareness`; SOCIETY 27:8: `beginning—the`; SOCIETY 31:8: `reliably—the`; SOCIETY 31:12: `these—changing`; SOCIETY 31:12: `mind—is`; SOCIETY 32:13: `memorisation—students`; SOCIETY 32:26: `past—capable`; SOCIETY 34:3: `itself—some`; SOCIETY 35:3: `inherited—no`; SOCIETY 38:12: `again—ignorance`; SOCIETY 38:13: `taboos—what`; SOCIETY 38:19: `something—sometimes`; SOCIETY 38:26: `nature—wisdom`; IDENTITY 1:8: `them—conquest`; IDENTITY 1:12: `work—some`; IDENTITY 7:8: `doors—education,`; RELATIONSHIPS 32:7: `reality—many`; RELATIONSHIPS 37:7: `failing—and`; EXISTENCE 2:11: `discipline—acknowledges`; EXISTENCE 3:1: `passes—permanence`; EXISTENCE 3:12: `knowing—but`; EXISTENCE 3:20: `monuments—because`; EXISTENCE 3:21: `dead—the`; EXISTENCE 3:24: `forward—and`; BELIEF 2:8: `drought—to`; BELIEF 3:3: `belief—however`; BELIEF 3:3: `intense—does`; BELIEF 16:24: `salvation—some`; BELIEF 16:24: `ideas—and`; PURPOSE 1:21: `certainty—few`; PURPOSE 1:24: `triumph—both`; PURPOSE 1:26: `pursuit—no`

Standalone spaced dashes (` — `) at line breaks keep their spaces.

### 6.6 Other formatting decisions

- **Small capitals** (p. 4): the heading is drawn as `T O THE R EADER` (large T and R, smaller letters). It is output as `TO THE READER`. No letters changed.
- **Untitled sections**: the dedication (p. 3) and the closing text (p. 544) have no heading in the source. They are placed under bracketed editorial markers only. No heading was invented.
- The `CROSS-` / `REFERENCE` / `INDEX` heading wraps over three lines on p. 545. It is joined as `CROSS-REFERENCE INDEX`, which matches the Contents and running header.
- **Contents page numbers** refer to the original PDF. They were kept, and dot leaders were replaced by a tab (dot-leader tab stop in the DOCX).
- **Glossary book tags** such as `(Relationships)` are kept on their own line after each definition.
- No paragraph breaks inside a verse were found. Every verse is one continuous block in the source, so each is one line.
- No character-encoding damage was found. The only non-ASCII characters are `— ’ “ ” ✦`, all valid, and there are no ligature code points.
- Two book pages contain a single verse after a chapter's main page (e.g. p. 165, Power 1:13). This is layout only; nothing is missing.

### 6.7 Note text that names books not in this edition

The prose of 24 notes cites verses under book names that are not among the ten books: `Seeker` (20 notes) and `Responsibility` (4 notes). These look like earlier working titles. In most of these notes, the `See also` line names a current book and verse, and in some cases the numbers differ from the prose (e.g. note 1314 says `Responsibility 8:25` while its See also line gives `Freedom 27:11`). The note text is kept exactly as written. The `See also` lines and the index use the current book names and are the reliable machine-readable links.

| Note | Anchored at | Name in note prose | See also line |
|---|---|---|---|
| 315 | Freedom 19:6 | Seeker 25:5 | See also: Inquiry 25:5 |
| 320 | Freedom 19:25 | Seeker 2:5 | See also: Inquiry 2:5 |
| 322 | Freedom 20:5 | Seeker 12:2 | See also: Inquiry 12:2 |
| 345 | Freedom 22:15 | Seeker 17:5 | See also: Inquiry 17:5 |
| 349 | Freedom 22:27 | Seeker 25:9 | See also: Inquiry 25:9 |
| 404 | Freedom 28:11 | Seeker 18:2 | See also: Inquiry 18:2 |
| 431 | Freedom 31:4 | Seeker 11:1 | See also: Inquiry 11:1 |
| 444 | Freedom 32:10 | Seeker 24:8 | See also: Inquiry 24:8 |
| 490 | Power 4:13 | Seeker 4:13 | See also: Inquiry 4:13 |
| 496 | Power 5:11 | Seeker 23:7 | See also: Inquiry 23:7 |
| 509 | Power 8:10 | Seeker 2:6 | See also: Inquiry 2:6 |
| 586 | Society 2:9 | Seeker 10:7 | See also: Inquiry 10:7 |
| 590 | Society 3:4 | Seeker 14:3 | See also: Inquiry 14:3 |
| 612 | Society 7:4 | Seeker 23:7 | See also: Inquiry 23:7 |
| 621 | Society 9:5 | Seeker 22:8 | See also: Inquiry 22:8 |
| 1002 | Relationships 5:9 | Seeker 5:6 | See also: Inquiry 5:6 |
| 1139 | Relationships 33:6 | Seeker 9:3 | See also: Inquiry 9:3 |
| 1145 | Relationships 33:28 | Seeker 15:11 | See also: Inquiry 15:11 |
| 1149 | Relationships 34:13 | Seeker 15:7 | See also: Inquiry 15:7 |
| 1206 | Humanity 2:7 | Seeker 23:1 | See also: Inquiry 23:1 |
| 1314 | Existence 1:3 | Responsibility 8:25 | See also: Freedom 27:11 |
| 1349 | Belief 1:9 | Responsibility 1:7 | See also: Freedom 20:7 |
| 1355 | Belief 2:9 | Responsibility 11:3 | See also: Freedom 30:3 |
| 1367 | Belief 4:14 | Responsibility 6:3 | See also: Freedom 25:3 |

## 7. What was checked against the original, and what could not be

**Checked against the original for every page:** book and chapter headings, all verse references, the assignment of every verse to its book and chapter, joins at every page and column break, every footnote number and marker, note labels, "See also" lines, running headers and page numbers, the Contents, the index, and the glossary. All of these were checked programmatically from character positions and fonts, and the full text was cross-checked against `pdftotext`.

**Also checked by eye against page images:** pp. 6, 7, 8 (opening of Inquiry), 43 (empty verse 31:4), 164–165 (empty verse Power 1:12), 245, 491, 543–550 (end of Purpose, closing text, index, glossary).

**Could not be verified from the PDF alone:**
- whether a space existed at the 49 em-dash line breaks in §6.5
- the intended text of the 31 empty verses, and whether the 28 unflagged notes really belong to the inferred verse
- whether the repeated chapters in §6.3 and the broken cross-references in §6.2 are intended
- digits inside note text (e.g. `1:6’s`) were left out of the token cross-check by design. They were taken directly from the PDF character layer, and every "See also" target was checked structurally.

## 8. Recommended next steps before database import

1. The author decides what to do with the 31 empty verses: supply the text from the author's drafts, or keep the references as intentionally empty. The author also confirms the 31 probable note anchors.
2. The author fixes or confirms the 3 broken cross-references, the repeated passages, and the legacy book names in note prose (§6.7).
3. Then generate the import file from the DOCX styles or the TXT conventions in §3, skipping every `[[…]]` line.

