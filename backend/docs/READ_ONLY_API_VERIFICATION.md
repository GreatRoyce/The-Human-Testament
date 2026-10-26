# Read-only API verification

Latest observed run: 2026-10-11, following the [canonical-content fidelity changes](CANONICAL_CONTENT_PIPELINE.md). The configured MongoDB connection and ping pass. All 13 HTTP checks pass. Status remains **PARTIAL** because there are no approved published books; positive Human Testament reads require approved content, not a draft import to satisfy a smoke test.

| GET check | Result |
| --- | --- |
| `/api/health` | 200; valid success/timestamp |
| `/api/books/inquiry/chapters/0` | 400; invalid chapter number |
| `/api/books` | 200; empty published list |
| `/api/books/read-only-check-missing-book` | 404; Book not found |
| Missing book's chapter list/detail, verse list/detail, supporting material | Five 404 responses; Book not found, not absent-route responses |
| `/api/glossary` | 200; empty list |
| `/api/cross-references` | 200; empty list |
| `/api/cross-references/index` | 200; empty list |
| `/api/sections` | 200; empty list |

Dedicated verse/supporting routes are implemented. Edition approval and publication filters now apply to every content read. Health alone does not prove database health; the separate connection and ping supply that evidence.

Run `npm run api:check` from `backend/`. It loads the existing `.env` without printing credentials, disables automatic collection/index creation before loading models, starts the actual app on a temporary loopback port, connects through the existing helper, pings, and performs only GET/read queries. It closes the server/connection afterward. It never invokes the importer or `src/server.js`.

Exit 0 means available checks and ping passed; inspect `verificationStatus`, `positivePublishedReads`, and `limitations` for gaps. Errors are sanitized. Sandbox DNS restrictions may require an authorized rerun outside the sandbox.

The seven original query-double HTTP tests remain, with assertions extended for edition/publication scope and public DTOs. The full backend suite passes 38 tests, including real disposable MongoDB persistence and seven HTTP/fidelity subtests using synthetic content. This proves the tested storage/API behavior, not approved manuscript fidelity in the configured database. The synthetic tests never load `.env` or use `MONGODB_URI`.

No configured database records, collections, indexes, or source files were modified. No unapproved content was imported. For the exact source-fidelity scope, changed-file inventory, unresolved issues, and controlled import requirements, read the linked handoff.
