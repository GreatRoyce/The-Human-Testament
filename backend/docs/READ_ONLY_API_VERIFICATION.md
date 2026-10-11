# Read-only API verification

The configured MongoDB connection and a `ping` command succeeded. The existing Express app was exercised over HTTP on a temporary loopback port. No draft was imported, no test fixture was inserted, and no database mutation endpoint was called. Automatic Mongoose collection and index creation were disabled before importing the models or connecting.

| GET route / check | Observed result |
| --- | --- |
| `/api/health` | 200, successful response and valid timestamp |
| `/api/books` | 200, empty published-book list |
| `/api/books/__read_only_check_missing_book__` | 404, Book not found |
| `/api/books/__read_only_check_missing_book__/chapters/1` | 404, Book not found |
| `/api/books/inquiry/chapters/0` | 400, invalid chapter number |
| `/api/books/inquiry/chapters/1/verses` | 404, API endpoint not found; route is absent |
| `/api/books/inquiry/chapters/1/verses/1` | 404, API endpoint not found; route is absent |

There are no published books available through the API. Therefore successful book-detail, chapter-detail, and verse reads could not be verified against live published content. The current chapter endpoint returns its verses in the chapter response; dedicated verse-list and single-verse routes are not implemented. The overall live verification status is **PARTIAL**, even though all available checks passed. An API health response alone does not establish database health; the separate connection and ping are the evidence for that.

## Automated HTTP coverage

`tests/read-api.test.js` adds seven tests around the actual mounted app using isolated Mongoose query doubles, without connecting to a database. They cover health and unknown routes, published-book list/detail responses, empty and missing results, chapter responses containing verses, publication filters, query ordering, invalid chapter numbers, early returns on missing content, exact verse-text preservation, and safe public error responses.

All 22 tests pass: the original 15 ingestion tests plus these seven API tests. Query doubles establish route/controller behavior and query intent; they do not establish positive live-data behavior or editorial correctness.

## Repeat safely

Run `npm run api:check` from `backend/`. The check loads the existing backend `.env` without printing the URI or credentials, disables automatic schema writes, starts the existing app on a temporary port, connects through the existing database helper, pings MongoDB, and issues only GET requests and read queries. It closes its server and connection afterward. It does not call `src/server.js` or the importer.

Exit code 0 means the available HTTP checks and database ping passed; inspect `verificationStatus`, `positivePublishedReads`, and `limitations` for coverage gaps. Connection or check failures return exit code 1 with sanitized diagnostics. If approved published data is already present in a future run, the checker will inspect an existing book and chapter without creating fixtures. Missing verse routes remain a reported capability gap.

The application server, routes, controllers, models, database configuration, importer, and frontend were not modified. Adding dedicated read-only verse routes and aligning backend responses with the frontend API contract can be a separate scoped change. Positive live-content verification must wait for approved content; the draft must not be imported merely to make a smoke test pass.
