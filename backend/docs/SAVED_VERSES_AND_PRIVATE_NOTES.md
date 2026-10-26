# Saved verses and private notes

Implemented October 24, 2026. Readers can save canonical verse references and keep multiple private notes per verse. These are account-owned records in MongoDB, separate from the shared PDF-derived manuscript and its canonical editorial `Note` model. No manuscript, edition, ingestion, publication, dependency, or environment-secret changes are part of this task.

## Storage and reference policy

- `Bookmark` (`bookmarks`): immutable required `user` reference and `verseId`, automatic `createdAt`. The unique, nonsparse, unconditional compound index `bookmark_user_verse_unique` on `{ user: 1, verseId: 1 }` prevents duplicates, including concurrent requests. A save returns 201 for a new bookmark or 200 with the existing bookmark. Different users can save the same reference independently.
- `PrivateNote` (`privatenotes`): immutable required `user` and `verseId`, required `content`, automatic `createdAt`/`updatedAt`. **Multiple notes per user per verse** are supported; there is deliberately no unique user/verse note constraint.
- Content must contain a non-whitespace character and contain at most **5,000 JavaScript UTF-16 code units** (the textarea's `maxLength` convention). Validation never trims, normalizes, rewrites, or interprets authored text. React renders it as escaped plain text with whitespace preserved.
- Both models use strict schemas, explicit index initialization, owner/ID lookup indexes and user/recent indexes. Notes additionally have a user/verse/recent index. API DTOs contain only `id`, `verseId`, `createdAt`, and, for notes, `content` and `updatedAt`. No account credentials or ownership IDs are serialized by these endpoints.
- Canonical IDs such as `freedom:10:14` must exactly exist in `shared/manuscript.json`'s reference map. Unknown book/chapter/verse references and aliases such as `freedom:010:14` return 404. Validation uses the shared corpus even if optional legacy database content mode is configured. Nothing creates a canonical record or copies verse text into MongoDB.
- Existing unresolved reference slots are valid references. They retain their missing-source status; the interface displays an unresolved-source notice rather than supplying text. Repeated authored passages retain their distinct existing references unchanged.

## HTTP contract

All endpoints require the existing bearer access token, a currently active User and exact unexpired/unrevoked RefreshSession. Active unverified users may use their private library; public reading remains anonymous. Responses use `{ success: true, data: ... }` or the existing safe error envelope.

| Endpoint | Input | Successful data |
| --- | --- | --- |
| `POST /api/bookmarks` | JSON `{ verseId }` | `{ item }`, 201 new / 200 already saved |
| `GET /api/bookmarks` | Optional `page`, `limit`, `verseId` | `{ items, pagination }` |
| `DELETE /api/bookmarks/:verseId` | JSON `{}`; URL-encode verse ID | `{ item }` |
| `POST /api/notes` | JSON `{ verseId, content }` | `{ item }`, 201 |
| `GET /api/notes` | Optional `page`, `limit`, `verseId` | `{ items, pagination }` |
| `GET /api/notes/:id` | 24-hex note ID | `{ item }` |
| `PATCH /api/notes/:id` | JSON `{ content }` | `{ item }` |
| `DELETE /api/notes/:id` | JSON `{}` | `{ item }` |

No dedicated bookmark lookup endpoint is added. The reader checks `GET /api/bookmarks?verseId=freedom%3A10%3A14&limit=1` instead.

Lists default to page 1, limit 20; limit is 1–50 and page 1–10,000. They sort newest first by `createdAt`, then `_id` descending. `pagination` contains `page`, `limit`, `total`, `pages`. Optional `verseId` filters an exact canonical reference. Unknown, repeated, nested, operator or ownership query fields are rejected with 400. Offset pagination/counts are scoped to the owner; they are not a transactional snapshot during concurrent writes.

## Ownership and request safeguards

Identity comes exclusively from `auth.middleware.authenticate`, never a body, query or identity header. The existing `privateOwner` plugin now accepts an explicit `field: 'user'`; its default `owner` contract is unchanged. The existing owned-resource service supports that field and distinct create/update allowlists so immutable verse references can be supplied on creation but never moved later. Note reads, edits and deletes include both record ID and authenticated user in the database operation. Bookmark lists and deletions likewise include the authenticated user. There is no privileged ownership bypass.

POST/PATCH/DELETE require an allowed Origin, `X-CSRF-Protection: 1` and JSON media type, including `{}` for DELETE. Each private router limits writes to 120 requests per IP per 15 minutes with the existing bounded, process-local limiter. Multiple server instances do not share counters. Credentialed CORS permits only configured trusted origins; private paths are excluded from development request logs and return `Cache-Control: no-store`, including errors. Authentication is a request-time state check with the same revocation semantics as existing ordinary private operations.

Unknown input/ownership fields, timestamps, operators, canonical `text` fields, immutable reference changes and malformed note content are rejected. Foreign, absent and malformed note IDs receive the same 404 response. Anonymous/forged/revoked authentication receives 401. Missing storage or the required bookmark unique index fails closed with 503; the service never silently operates without uniqueness. Ordinary login and public reading remain independent of private-storage readiness.

The public manuscript controllers/provider do not import private models or merge private notes into editorial content. No reading history, progress, sharing, public comments or administrative endpoints are implemented.

## Frontend integration

The reader's existing selected-verse controls now offer saving/removing a verse, a private-note editor and links to saved verses and private notes. Selection remains distinct from canonical rendering. A note's immutable reference is shown above its editor, and links retain the established `/testament/:book/:chapter/:verse` address.

`/reading/saved-verses` and `/reading/notes` provide pagination, optional passage filters, loading/empty/error states, mutation feedback, removal, and note editing/deletion. Account settings links to both lists. A 401 hides private content and prompts login; login can return to the originating reader/list location. If a canonical passage cannot load, its saved reference and private note remain accessible with an unavailable notice.

The new feature services reuse `api/client` and the existing auth service's in-memory session closure. A restricted private request method attaches credentials without exporting the bearer token; stale responses from a prior session are rejected after logout or another login. No authoritative bookmark or note copy is kept in browser storage. Saved passage display uses the existing `verseService`, which resolves through the configured manuscript content provider, including the default shared PDF dataset. Content mode is not silently switched on failure.

Existing authentication limitations remain: access tokens expire after 15 minutes, automatic refresh is not implemented, and a page reload requires login again. MongoDB records persist across those logins. This task does not change mail delivery or add registration UI.

## Database initialization

Before enabling these features against an existing deployment, run from `backend` using the deployment's existing approved database configuration:

```powershell
npm run auth:init
```

This existing command now creates the bookmark/private-note collections and their declared indexes in addition to the account/session/recovery/verification collections. It seeds no account and writes no manuscript content. No data backfill is required for a new installation. If an operator has manually created conflicting collections/indexes or duplicate user/verse bookmark records, initialization fails and those conflicts require a deliberate database migration; the command does not delete data or drop indexes to force success.

No Atlas initialization or real email delivery was performed during this task. Tests use disposable local replica sets. The older downloadable API PDF remains a dated Task 7 snapshot; this document records the new routes.

## Validation

- Before editing: complete backend suite **158 passed**, zero failures.
- New backend suite: **17 passed**, including all CRUD, concurrent duplicate saves, database-level uniqueness, exact authored text, invalid references, multiple notes per verse, pagination, cross-owner denial, input injection, authentication, session persistence/revocation, real frontend-to-HTTP integration, CORS/CSRF and missing-index failure.
- Complete backend suite after implementation: **175 passed**, zero failures, skips or cancellations.
- Complete frontend suite: **34 passed**, zero failures, skips or cancellations (7 new tests). This covers real service transport/payloads, private response contracts, stale sessions, canonical verse resolution, content validation, route/card/editor markup and escaped HTML, alongside all existing frontend tests.
- Frontend lint and production build passed. The build's **32 manuscript consistency checks passed**, all **10 data files remained unchanged**, and `databaseModified` remained false. Vite retains its existing bundle-size warning; no unrelated bundle restructuring was performed.
- Task-scoped whitespace checks passed. A full-workspace diff check also reports preexisting trailing whitespace in `backend/scripts/extract-manuscript.js:61`; that ingestion file was left unchanged.
- In-app browser connection was unavailable. Rendered markup and API tests do not establish browser interaction or visual evidence. No browser end-to-end result is claimed.

The preexisting authorization test classified `/api/notes` as an absent canonical endpoint. It now tests that path as an authenticated private endpoint rejecting canonical write payloads; all original canonical write-method checks remain intact. No existing test was weakened or removed.

## Files created or modified for Task 8

Created:

- `backend/src/models/Bookmark.js`
- `backend/src/models/PrivateNote.js`
- `backend/src/utils/canonicalReference.js`
- `backend/src/services/personalStorage.js`
- `backend/src/services/personalLibrary.service.js`
- `backend/src/controllers/personalLibrary.controller.js`
- `backend/src/routes/personalLibrary.routes.js`
- `backend/tests/personal-library.test.js`
- `backend/docs/SAVED_VERSES_AND_PRIVATE_NOTES.md`
- `frontend/src/services/personalLibrary.js`
- `frontend/src/services/bookmarks.service.js`
- `frontend/src/features/reader/components/LibraryLoginPrompt.jsx`
- `frontend/src/features/reader/components/VerseLibraryActions.jsx`
- `frontend/src/features/reader/components/SavedPassage.jsx`
- `frontend/src/features/reader/components/PersonalLibrary.jsx`
- `frontend/tests/personal-library.test.mjs`

Modified (including previously empty scaffolds):

- `backend/src/models/privateOwner.js`
- `backend/src/services/ownedResource.service.js`
- `backend/src/services/authStorage.js`
- `backend/src/config/auth.js`
- `backend/src/app.js`
- `backend/scripts/initialize-auth-storage.js`
- `backend/tests/authorization.test.js`
- `backend/docs/AUTHORIZATION.md`
- `frontend/src/services/api/client.js`
- `frontend/src/services/auth.service.js`
- `frontend/src/services/notes.service.js`
- `frontend/src/components/notes/NoteEditor.jsx`
- `frontend/src/components/notes/NoteCard.jsx`
- `frontend/src/components/reading/SavedVerseCard.jsx`
- `frontend/src/features/reader/components/ReaderControls.jsx`
- `frontend/src/features/account/AccountSettingsForm.jsx`
- `frontend/src/pages/Reading/SavedVerses.jsx`
- `frontend/src/pages/Reading/Notes.jsx`
- `frontend/src/pages/Auth/Login.jsx`
- `frontend/src/routes/AppRoutes.jsx`

Other existing workspace changes predate this task. Temporary verification logs and generated build output are not implementation source files.
