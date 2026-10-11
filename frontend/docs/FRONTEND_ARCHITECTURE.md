# Human Testament frontend architecture

Migration date: 2026-10-11. This is a React 19 / Vite 8 / JavaScript frontend with React Router 7 and Tailwind 3. No backend, database access, authentication, or commerce implementation is included. Existing dependencies are retained; Zod was already installed.

## Before the migration

`App.jsx` owned the router and fallback. Only `/`, `/contact`, `/privacy`, and `/terms` were implemented. Home composed editorial components from `components/home`. Its Sanctuary section was the working reader: four Freedom 10 verses, local selection, and a margin-note panel. The Testament pages and global content hooks/services were empty. Book cards linked to `/books/:id`, which reached the fallback. There were 127 empty source scaffold files.

`data/books.js` held ten summaries and chapter counts; `data/featuredVerses.js` held selected quotations; `data/readerSection.js` held the Freedom 10 preview and its marketing copy. Freedom 9:7, footnote 257, a cross-reference, and a glossary preview were embedded in `FeaturedVerse.jsx`. There was no full chapter corpus. Other home data contains editorial cards, prompts, and quotations that must not automatically become canonical verses.

## Active folder structure

```text
src/
  App.jsx                          BrowserRouter and shared Navbar
  routes/
    AppRoutes.jsx                  Route composition
    UnavailablePage.jsx            Existing recovery experience
  pages/
    Home/                          Home composition
    Testament/                     Testament, BookPage, ChapterPage, VersePage
    Search/                        URL-driven search composition
    Legal/                         Existing legal pages, unchanged
  components/
    branding/                      Existing logos, unchanged
    layout/                        Navbar, PageContainer, ContentPage, Footer
    shared/ResourceState.jsx       Loading/error/empty boundary
    ui/                            Existing primitives and resource states
  features/
    home/
      components/                  Existing editorial sections
      content/                     Reader marketing copy and glossary preview
    testament/
      components/                  BookGrid, ChapterNavigation, LegacyBookRedirect
      hooks/                       useBooks, useBook, useChapters, useChapter
      services/                    bookService, chapterService, verseService
      types/                       content.d.ts, contracts.js
      utils/contentAddress.js      Address validation and reader URLs
    reader/
      components/                  ReaderPreview, ChapterReader, VerseList,
                                   MarginNotes, ReaderControls
      hooks/useReaderSelection.js  Client-only verse selection
    search/
      components/                  SearchForm, SearchResults
      hooks/useSearch.js
      services/searchService.js
      types/                       search.d.ts, contracts.js
  hooks/useResource.js             Abortable asynchronous resource lifecycle
  services/
    contentSource.js               Explicit mock/API provider selection
    api/
      client.js                    Only HTTP transport implementation
      ApiError.js                  Normalized frontend errors
      contentApi.js                Proposed REST paths and response adaptation
  config/api.config.js             Public Vite environment values
  data/
    mock/testament/                Preserved source fixtures and domain adapter
    ...                            Unchanged home/editorial data
  types/api.d.ts                   Error and request contracts
  assets/                          Existing assets, unchanged
```

Existing empty scaffolds for unrelated future features remain in their original locations. They are not implemented features. No new empty future-domain folders were added.

## Boundaries and ownership

The main read path is `ChapterPage -> useChapter -> chapterService -> content provider -> API client -> future REST backend`. Home's `ReaderPreview` uses the same hook/service and renders the same `ChapterReader` presentation. `ChapterReader`, `VerseList`, and `MarginNotes` receive data and callbacks; they do not import fixtures or call transport code.

`useResource` coordinates loading, success, errors, retries, cleanup, and cancellation. A changed resource key hides old content immediately. Cleanup both aborts the request and ignores late results. `useReaderSelection` owns ephemeral UI selection separately. This is not saved reading progress, a bookmark, a user note, or a highlight.

Pages compose features. Editorial home copy can remain local. Book/chapter/verse content is consumed through services. The `data/index.js` legacy barrel is retained with corrected exports but is not the reader's data-access API.

For future work, add a domain only when there is real behavior: users/accounts and progress; bookmarks; notes; highlights; commentary; essays; questions; glossary; references; community/discussions/comments/reading circles; commerce/products/orders. Each should own its contracts, hooks, services, and presentation. User-owned data needs authentication and independent resource lifecycles; do not mix it into the canonical chapter payload or use an author footnote as a private user note. Sections can extend ChapterContent when the backend contract is agreed. Backend database IDs and ORM objects must stay outside these public contracts.

## Public contracts

The project stays JavaScript/JSX. TypeScript declaration files provide editor-visible interfaces and JSDoc service return contracts; no TypeScript migration or compiler dependency is introduced. Zod validates runtime service responses.

- `Book`: slug, title, canonical order, printed number label, chapter count, subtitle, description.
- `Chapter`: book slug, positive chapter number, `completeness: 'excerpt' | 'complete'`.
- `Verse`: book slug, chapter number, verse number, exact text, nullable published commentary.
- `ChapterContent`: book, chapter, verses. Addresses must agree; verse numbers are unique.
- `Commentary` and `Reference`: published footnote and addressed cross-reference contracts.
- `SearchResult`: a verse result, display reference, and addressed verse. Extend the discriminated kind when additional search domains are implemented.
- `ApiError`, `ApiErrorCode`, `RequestOptions`: stable frontend failures and cancellation options.

## Services and REST proposal

| Service | Method | Proposed request / response |
| --- | --- | --- |
| bookService | getBooks(options?) | GET /api/books -> Book[] |
| bookService | getBook(slug, options?) | GET /api/books/:slug -> Book |
| chapterService | getChapters(slug, options?) | GET /api/books/:slug/chapters -> Chapter[] |
| chapterService | getChapter(slug, number, options?) | GET /api/books/:slug/chapters/:number -> ChapterContent |
| verseService | getVerses(slug, chapter, options?) | GET /api/books/:slug/chapters/:chapter/verses -> Verse[] |
| verseService | getVerse(slug, chapter, verse, options?) | Read the proposed verses collection and select the numbered verse |
| searchService | search(query, options?) | GET /api/search?q=... -> SearchResult[] |

These endpoints do not exist as part of this frontend work. `contentApi.js` currently expects plain JSON objects/arrays. If the backend chooses envelopes or different DTO names, adapt them there and keep service outputs stable. Error responses are normalized from HTTP status; backend error bodies are not assumed to have a schema or shown directly to readers. 404 becomes NOT_FOUND; invalid input, malformed JSON/payloads, configuration, network, and other HTTP failures have separate codes.

`Book.order` is the canonical display sequence, not a database primary key. Legacy book links resolve their old numeric position to the matching public slug. Keep that sequence stable when agreeing the backend contract.

## Mock and API configuration

```dotenv
VITE_CONTENT_SOURCE=mock
VITE_API_URL=
```

Mock mode is the default and uses only supplied excerpts. The original three fixtures were moved without text changes. `verseApparatus.js` preserves the exact verse, note, cross-reference, and glossary text extracted from JSX. The adapter normalizes legacy field names, gathers supplied addressed quotations, marks all mock chapters as excerpts, and returns defensive copies. It does not generate the remaining 231 chapters or infer canonical verses from editorial prompts. Empty chapter lists are allowed; unsupplied addresses return NOT_FOUND.

Services provide synchronous initial snapshots only in mock mode so the existing home preview still renders immediately. The subsequent asynchronous hook uses the same service method. API mode supplies no mock snapshots and never falls back to fixtures after a failed request.

To connect a backend, set `VITE_CONTENT_SOURCE=api` and `VITE_API_URL` to its origin or deployment prefix, **without `/api`**, then restart Vite/rebuild. URL values are public; credentials do not belong in frontend environment variables. No component contains a backend host. Vite environment values are fixed at build time.

## Routes

Existing home anchors and `/`, `/contact`, `/privacy`, `/terms`, and unmatched-route recovery are retained. Book-card destinations now use public slugs. Added routes:

```text
/testament
/testament/:bookSlug
/testament/:bookSlug/:chapterNumber
/testament/:bookSlug/:chapterNumber/:verseNumber
/search?q=...
/books/:bookId   -> client redirect to the corresponding /testament/:bookSlug
```

Example: `/testament/freedom/10/14` opens Freedom 10 with verse 14 selected. A verse address retains chapter context. Missing verse addresses show a recovery link; missing books/chapters settle into the shared error state. Blank searches, zero results, failed searches, and empty content have separate states. Search is submitted through URL parameters; no request is fired for every keystroke.

Navbar search and the Sanctuary launch action now open implemented destinations without changing their styling. Existing unavailable account, community, and commerce functionality remains outside this migration.

## Verification and limits

Run `npm run lint`, `npm run build`, `npm test`, `npm run check:home`, and `npm run check:content`.

Final migration results: lint and production build passed; all 8 tests passed; the home render checks passed; 63 content route renders and 162 relative imports passed; a running Vite server served 9 direct URLs and transformed 3 requested JavaScript modules successfully. The preservation audit matched 35 file hashes and the complete normalized home text against the pre-change baseline. `git diff --check` passed. Temporary audit snapshots/scripts were removed.

The service tests cover mocks, exact note mappings, address validation, missing content, searches, malformed payloads, HTTP/network failures, cancellation forwarding, and API mode without mock fallback. Home render checks cover landmarks, section/ARIA/anchor targets, collections, tabs, and all four preview verse selections. Content checks cover every supplied chapter/verse URL, search, legal/fallback routes, all relative source imports, and direct navigation/JavaScript transforms through a running Vite server.

The pre-migration home check was already stale (9 sections expected, 12 rendered); it now checks the existing full page. No in-app browser was available. Server rendering does not verify client effect timing, redirect execution, real focus movement, mobile viewport layout, zoom, or screen-reader behavior. The future backend has not been contacted. Windows sandbox spawn restrictions may require approval to run Vite-based checks outside the sandbox.

## Remaining work and backend handoff

1. Agree an OpenAPI/JSON contract with the separate Node.js backend, especially ChapterContent, excerpt/completeness semantics, search results, error statuses, pagination, and canonical slugs/order. The proposed REST adapter is the adjustment point.
2. Confirm the backend permits the frontend's origin through CORS, then run API mode against it. Authentication/cookies need an explicit agreement when user features are built; this read-only client does not assume a session mechanism.
3. Verify loading/retry/cancellation, URL navigation, legacy redirects, verse selection, and responsive appearance in a real browser. Configure SPA fallback on the production host so direct reader URLs work there too; Vite's local fallback does not configure production hosting.
4. Import the full approved corpus; keep exact text and distinguish sections/commentary/editorial material. The fixtures are excerpts, not a source for fabricated missing content.
5. Build user/community/commerce capabilities incrementally in their domains. Unrelated old empty scaffolds remain technical debt and can be removed when their domains are migrated.
6. The existing large logo assets and some home marketing/status copy still need a separate product/performance review. Runtime validation adds bundle weight; consider route splitting and lazy mock loading as content grows. No caching/state library is required for the current read-only scope.

See [MIGRATION_FILES.md](MIGRATION_FILES.md) for the complete created/moved/modified/deleted inventory.
