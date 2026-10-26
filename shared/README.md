# The project manuscript

`backend/data/The-Human-Testament--Complete-Manuscript.pdf` is the source selected by the author for wording and Book/Chapter/Verse references throughout this project. Its current SHA-256 is `bbdd152c8b870862b44214dbd56059fa2a85146e6f1ad1e4d48f1d5c7fa34c76`.

`manuscript.json` is a generated, shared representation of that PDF: **10 books, 230 chapters, 3,905 numbered references, 3,874 verses with text, 1,470 notes, 72 note cross-references, 72 index entries, and 38 glossary entries**. It retains the opening pages, dedication, introduction, contents, closing text, index and glossary. `manuscript.mjs` supplies the same address lookup and read behavior to the frontend and backend.

The frontend defaults to `VITE_CONTENT_SOURCE=pdf`; the old `mock` setting is a compatibility alias for the same corpus. Reader pages, verse links, search results, homepage quotations, and notes resolve to this corpus. `/testament/materials` exposes the opening and closing material, index and glossary. Selected verses show their actual PDF page numbers, including continuation pages.

The backend defaults to `CONTENT_SOURCE=pdf`, serving this shared content without a MongoDB connection. `CONTENT_SOURCE=database` explicitly selects the existing database service and its approval/publication rules. This change does not import or publish database records, change the frozen candidate, or alter the source PDF/clean transcription. Deployments must include `shared/` alongside `frontend/` and `backend/`.

## Verify or regenerate

From `backend/`:

```powershell
npm.cmd run content:check
npm.cmd run content:sync
```

`content:check` compares the entire generated dataset with fresh regeneration; it writes nothing. `content:sync` runs the existing full PDF/text/structure verification, extracts every verse's PDF page address, and writes only `shared/manuscript.json`. Both fail if fidelity checks fail. Frontend production builds run `content:check` first so stale or manually changed data cannot silently ship.

Do not edit the generated JSON or retype quotations. Use `manuscriptVerse(book, chapter, verse)` in frontend editorial data or the content services for reader/UI data. If a revised PDF is intentionally adopted, reconcile its structured transcription and validation evidence first, then regenerate and check the bundle. Merely replacing the PDF causes the checks to fail.

## Preservation rules and verification limits

The PDF itself has **31 numbered references without verse text**. They remain addressable with `status: missing_source_text` and no `text` property. No numbering is shifted and no wording is supplied. Repeated passages remain at every original address. Inferred note anchors, legacy citation names, and three invalid cross-reference targets remain recorded; they are not silently repaired.

The bundle preserves the exact decoded working-transcription strings. Direct PDF comparisons cover every authored verse, note, book title/subtitle, and preserved front/back section, excluding page layout whitespace, running headers, and contents dot leaders. The existing 49 uncertain dash joins remain unchanged. This establishes wording/reference consistency within those limits, not identical PDF typography or certified original line-wrap spacing. Browser visual checks were unavailable in this session.

Validation includes complete corpus/string/note comparisons, HTTP retrieval of every chapter, missing-reference and page-address checks, and server rendering of all chapter routes with first/last and blank-reference selections.
