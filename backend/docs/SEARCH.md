# Public manuscript search

Task 10, October 24, 2026. Search now covers canonical verses, supporting notes/reflections, glossary entries and cross-references with filters, exact totals and stable pagination. The shared PDF-derived dataset remains authoritative. No canonical text, ingestion script, edition snapshot, publication approval, environment secret, dependency or database schema/index was changed. Search builds temporary lookup structures; it does not create a competing manuscript or index personal data.

## Supported modes

| Mode | Behavior |
| --- | --- |
| Backend `CONTENT_SOURCE=pdf` (default) | Uses the existing shared corpus and runtime provider. All four categories work without a database connection. The normalized search index is built lazily and reused. No PDF parsing occurs per request. |
| Backend `CONTENT_SOURCE=database` | Uses the same shared matching/ranking engine over a complete approved, published canonical edition. Required collections and source locations must be available; unavailable/incomplete storage returns 503. It never falls back to the PDF or imports/approves data. |
| Frontend `VITE_CONTENT_SOURCE=pdf` | Uses the same shared runtime provider and matching engine locally. |
| Frontend `VITE_CONTENT_SOURCE=mock` | Existing compatibility alias for the shared PDF provider; no separate manuscript copy. |
| Frontend `VITE_CONTENT_SOURCE=api` | Uses the existing API client and `/api/search`, forwarding filters and decoding typed results/pagination. No fallback or fabricated counts on failure. |

The old database provider had no search method. Its unsupported-method 501 error was also being converted to 500 by the global handler. Database search is now implemented, and genuinely unsupported provider methods retain a clear 501 response. Unsupported backend source configuration is still rejected at startup; unsupported content-type filters receive 400.

Database search rechecks approved published-edition eligibility on every request. Its in-memory snapshot is keyed by database connection namespace, edition ID, dataset hash and source version, and expires after 30 seconds. Concurrent cold requests share one build; failed builds are discarded. Approval withdrawal invalidates cached search on the next request. Changes to individual published records within the same edition can take up to 30 seconds to appear; controlled publication should use a new edition/hash or withdraw approval first. Pagination is stable within a source snapshot, not pinned across a subsequent edition change.

The database loader reads only published Book, Chapter, Verse, canonical Note, GlossaryEntry, CrossReference, CrossReferenceIndex and ContentSection records for the selected edition. It verifies published parent relationships, complete declared chapter/verse coverage, note anchors and glossary/index source-line destinations. Missing parents, incomplete required collections or missing material locations produce 503 rather than partial results or dead links. An initialized category with no published records contributes zero entries. Database content can differ from the fixed PDF according to the explicitly selected approved edition; matching and ordering rules are identical. Existing edition approval is required and is never granted by search.

## API contract and compatibility

`GET /api/search` stays public and read-only. For example:

```text
/api/search?q=responsibility&type=all&book=freedom&chapter=10&page=1&limit=20
/api/search?q=%22the%20shadow%20cast%20by%20freedom%22&type=verse
```

| Parameter | Rules |
| --- | --- |
| `q` | Required nonblank string, at most 200 UTF-16 code units and 32 distinct whitespace-separated terms. Ordinary whitespace is collapsed only for matching. Unsupported control characters are rejected. |
| `type` | `verse`, `note`, `glossary`, `cross-reference`, or `all`. API default is `verse` for compatibility; the new UI explicitly defaults to `all`. |
| `book` | Optional exact canonical book slug available in the selected source. |
| `chapter` | Optional positive integer belonging to the selected book; requires `book`. Includes only records anchored to that chapter. Unanchored glossary entries are excluded rather than assigned an invented chapter. |
| `page` | Positive integer, default 1, maximum 10,000. |
| `limit` | Positive integer, default 20, maximum 50. UI offers 10/20/50 and honors valid custom URL page sizes. |

Unknown, nested, repeated or operator-shaped query parameters and invalid page/filter values receive clear 400 errors. Arbitrary parameters never become MongoDB filters, regular expressions or file paths. Empty queries receive 400 without returning the whole manuscript. A literal `.*` query is ordinary text, not a regex.

The existing array `data` and page-length `count` are preserved; exact pagination metadata is added:

```json
{
  "success": true,
  "count": 0,
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "pages": 0 }
}
```

The example is a no-match response. `count` always equals the returned array length; `total` counts matching source records before pagination. An out-of-range positive page returns an empty array with the real total/page count. The UI offers First page recovery. No-match searches return total/pages zero.

`/api/search?q=...` continues to return verse objects with `kind`, `reference`, and `verse`, now also including stable result IDs and match metadata. Its HTTP array is now bounded to the default page size; clients that need all matches must paginate. The old direct local provider `search(query)` remains an all-matching verse-array compatibility wrapper, including blank-query `[]`, using the same matching engine. New HTTP and frontend screens use `searchPage` throughout. No second matching implementation was introduced.

## Result categories and source fidelity

Every new result has a stable `id`, `kind`, human-readable `reference`, and `match` (`exact`, `phrase`, `terms`). Returned source strings are cloned and never lowercased, trimmed, normalized, summarized or rewritten. Repeated authored passages remain separate results at their existing canonical IDs.

| `kind` | Payload and destination |
| --- | --- |
| `verse` | Original `verse` with canonical ID, text/status, source metadata and existing supporting material. Opens the established book/chapter/verse route. Existing unresolved reference slots can match a reference label but retain no invented text. |
| `note` | Original supporting `note`, including `text`, `rawText`, type, original `markerText`, anchor and review metadata. Reflections belong here. Opens the existing anchored verse; the UI explicitly labels supporting material and displays the original marker/raw text. |
| `glossary` | Original term/definition, book tag, book slug and source lines in `entry`. Opens the exact source-line paragraph on `/testament/materials`. |
| `cross-reference` | Original citation/index `entry`, targets/statuses and source metadata, with `origin: note` or `index`. Note citations open the existing source verse; index entries open their printed source line. Existing valid targets are linked; missing/invalid targets remain labeled source text with their original status. |

Supporting note anchors retain `explicit` versus `inferred`, `sourceMarkerPresent` and `reviewRequired`. Cross-reference `anchorStatus` follows the associated note only when their coordinates agree; otherwise it is `unverified`. `anchorExists` and a derived review flag prevent an uncertain location from appearing certified. These wrapper flags do not rewrite the original entry. The UI visibly distinguishes inferred/unverified anchors and review requirements.

The 72 note citations and 72 printed index entries are separate source records with distinct IDs/origin labels. A citation can therefore appear in both forms, or within a matching supporting note. Totals count records, not deduplicated wording. Glossary/index targets use existing source-line numbers; the materials page now gives those paragraphs stable HTML IDs and scrolls to an explicit source-line link after loading. Canonical text and generation artifacts remain unchanged.

## Transparent matching and ranking

Matching lowercases and collapses whitespace in separate lookup fields only. It is case-insensitive, literal substring matching; there is no stemming, synonym expansion, typo correction, fuzzy matching or user-generated regex.

1. An entire normalized reference label, canonical ID, title/term or content field equal to the query ranks first (`exact`).
2. A contiguous normalized phrase inside a lookup label or text ranks next (`phrase`).
3. Otherwise every query term must occur in the combined label/text fields, in any order (`terms`).

Wrapping the whole query in paired double quotes restricts results to contiguous exact/phrase matches; unpaired or embedded double quotes are rejected with guidance. Exact quoted matching ignores case/layout whitespace, not punctuation or wording.

Ties sort by canonical book order, chapter, verse, category (verse, note, glossary, cross-reference), then stable result ID. IDs remain distinct for repeated verses and citation origins. Glossary entries have book association without an invented chapter/verse. Search also matches note markers and existing source/target reference labels where meaningful.

## Performance and privacy

- The PDF index covers **5,557 records**: 3,905 canonical reference slots (3,874 authored verses plus 31 unresolved slots), 1,470 supporting notes, 38 glossary entries and 144 citation/index entries. Source JSON/provider data is already loaded; normalized lookup fields are computed once per index.
- The frontend memoizes local initial result pages for unchanged query/filter values. Typing and changing unsent filters do not issue search requests. Search requires an explicit form submission; query/filter/page state is kept in the URL. Book/type controls occupy full rows on small screens, labels and native controls support keyboard use, and loading/error/empty/count/navigation states use actual service results.
- HTTP search has the existing bounded process-local limiter configured for 120 requests per IP per 15 minutes, including invalid queries. It returns 429 with Retry-After. Counters are not shared across server instances and can affect users behind a shared IP.
- Database snapshot queries are limited to 20,001 records per collection and five seconds per query; exceeding the supported 20,000-record-per-collection corpus budget returns explicit 503. A larger future dataset requires measured review, not an automatic search-engine migration.
- A local smoke measurement over 100 mixed warmed PDF queries averaged **6.69 ms**, with **9.00 ms p95**; constructing the provider and first search took **156.82 ms**. These are machine-dependent measurements under concurrent validation, not an Atlas/network benchmark or service guarantee.
- Public search has no private model dependency or read path. It does not read PrivateNote, Bookmark, ReadingProgress, ReadingHistory, User, credentials or sessions, and does not persist search analytics or history. Database projections explicitly allow only canonical public fields. Tests insert hidden/private activity and make private-model reads fail to prove exclusion.

## Validation and deployment

The final complete backend suite passed **202 tests**, zero failures/skips/cancellations, run with `npm.cmd test -- --test-concurrency=1`. All preexisting tests remain intact. The new search suites cover ranking, case/whitespace, quoted phrases, all filters, stable boundaries/counts, validation, literal non-regex behavior, exact source strings, repeated verses, markers and uncertain anchors, glossary/citations, API compatibility, rate limits, PDF/database modes, approval withdrawal, unpublished parents, missing collections, cache behavior, 501 responses and private-data exclusion.

The first concurrent baseline run had four MongoDB setup timeouts at the existing 10-second startup limit (119 tests passed; four parent groups failed before their checks could run). The final sequential run preserved all assertions and timeouts. A new unpublished-parent fixture initially reused a unique book order; the fixture was corrected and the complete run passed. No existing test was removed or weakened.

The complete frontend suite passed **51 tests**, zero failures/skips/cancellations (six new search tests). It verifies exact source strings, typed results, malformed contracts, transport/filter forwarding, uncertainty labels, stable/source-line URLs, keyboard form markup, real counts, pagination, API-mode loading and explicit unsupported errors without fallback. Frontend lint and the final production build passed. All **32 manuscript consistency checks passed**, all **10 data files remained unchanged**, and `databaseModified` and `importApproved` stayed false. The existing Vite bundle-size warning remains. Task-scoped whitespace checks passed.

Browser connection was unavailable, so rendered markup, service, route and API tests are not browser click/scroll or visual evidence.

No database migration, new index, import, publication approval or new environment variable is required. PDF mode works immediately. Database mode requires the existing initialized, fully approved/published canonical collections and source sections. Nothing was initialized, imported, published or modified in Atlas during this task. Earlier API PDFs and task reports remain dated snapshots.

## Task 10 file inventory

Created:

- `shared/search.mjs`
- `backend/src/services/databaseSearch.service.js`
- `backend/src/middleware/search.middleware.js`
- `backend/tests/search.test.js`
- `backend/tests/search-database.test.js`
- `backend/docs/SEARCH.md`
- `frontend/src/features/search/utils/searchAddress.js`
- `frontend/tests/search.test.mjs`

Modified:

- `shared/manuscript.mjs` (runtime search delegation only)
- `backend/src/repositories/content.repository.js`
- `backend/src/services/content.service.js`
- `backend/src/services/readContent.service.js`
- `backend/src/controllers/book.controller.js`
- `backend/src/middleware/error.middleware.js`
- `backend/src/app.js`
- `frontend/src/services/api/contentApi.js`
- `frontend/src/services/api/client.js`
- `frontend/src/features/search/types/contracts.js`
- `frontend/src/features/search/types/search.d.ts`
- `frontend/src/features/search/services/searchService.js`
- `frontend/src/features/search/hooks/useSearch.js`
- `frontend/src/features/search/components/SearchForm.jsx`
- `frontend/src/features/search/components/SearchResults.jsx`
- `frontend/src/pages/Search/Search.jsx`
- `frontend/src/pages/Testament/ManuscriptMaterials.jsx`

Other existing dirty/untracked workspace files predate Task 10. Temporary verification logs and generated build output are not implementation source files.
