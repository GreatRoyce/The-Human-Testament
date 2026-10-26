# Reading progress and history

Task 9, October 24, 2026. Account-owned reading checkpoints now support continuing across logins and devices and viewing a private chronological history. The shared PDF-derived manuscript, canonical MongoDB models, ingestion files, editions and publication approval are unchanged. No dependency or environment secret was added or changed.

## Verified starting point

Before implementation, the existing authentication, password recovery, email verification, account settings, ownership helpers, bookmarks and private notes were inspected. A fresh complete baseline passed **175 backend tests** and **34 frontend tests**. Authentication checks the current User, active status, exact current RefreshSession and password-change claim; this task reuses that middleware, not a second token or identity mechanism. Bookmarks and private notes remain independent features and continue to use their existing models and endpoints.

## Models and canonical identifiers

`ReadingProgress` stores required immutable `user` (User reference), immutable `bookId`, required positive integer `chapterNumber`, optional positive integer `verseNumber`, server-controlled `lastReadAt`, automatic `createdAt`/`updatedAt`, and a positive integer `revision` for concurrency control. The unique nonsparse/unconditional compound index `reading_progress_user_book_unique` on `{ user: 1, bookId: 1 }` guarantees one current location per reader and book. A user/recent index supports continuing from the most recently visited book.

`ReadingHistory` stores immutable `user`, `bookId`, `chapterNumber`, optional `verseNumber`, server-controlled `visitedAt`, automatic `createdAt`, an immutable UUID-v4 `eventId`, and the resulting progress `revision`. The unique index `reading_history_user_event_unique` on `{ user: 1, eventId: 1 }` arbitrates duplicate events. User/recent and user/book/recent indexes support chronological pagination. Neither model stores canonical verse text, editorial material, email, password hashes or session credentials.

`bookId` is the existing canonical book **slug**, such as `freedom`, not a MongoDB Book ObjectId. The shared canonical reference utility now checks book/chapter/optional verse existence using `shared/manuscript.json`, including its unresolved reference slots. A known unresolved slot remains a valid stable reading location without supplying missing text. References are checked against the PDF-derived corpus regardless of optional legacy database content mode. No canonical book, chapter or verse is created from request input.

Both models use the existing private-owner plugin with `field: 'user'`, strict schemas, scalar validation and complete document-location validation. The progress service validates the whole location before its atomic query; Mongoose update validators alone cannot validate cross-field references. Models disable automatic collection/index creation in favor of explicit deployment initialization.

## API

All four routes use the existing success/error envelopes, bearer authentication, active-user/session checks, no-store responses and trusted-origin credentialed CORS. Anonymous manuscript access is unchanged; active unverified readers can use their own activity.

| Endpoint | Input | Successful `data` |
| --- | --- | --- |
| `GET /api/reading-progress` | No query fields | `{ items: [progress] }`, most recent first |
| `GET /api/reading-progress/:bookId` | Canonical slug; no query fields | `{ item: progress }`; 404 if no own checkpoint |
| `PUT /api/reading-progress/:bookId` | Checkpoint body below; no query fields | `{ item: progress, replayed: boolean }`, HTTP 200 for creation/update/replay |
| `GET /api/reading-history` | Optional `page`, `limit`, `bookId` | `{ items: [visit], pagination }` |

A checkpoint body is:

```json
{
  "chapterNumber": 10,
  "verseNumber": 14,
  "expectedRevision": 0,
  "eventId": "c7d459aa-df82-4dd9-9861-59d20294e333"
}
```

The example event ID is illustrative; generate a fresh UUID v4 for each deliberate new checkpoint and reuse the same body/key for a retry. `expectedRevision: 0` means no progress record exists. Otherwise use the revision returned by GET. A missing optional `verseNumber` clears a previously saved verse and stores a chapter-only location. Numeric strings, fractions, zero/negative positions, null verses and unsupported fields are rejected. Client timestamps, revision assignments, ownership fields, canonical `text`, dotted paths and update operators are not accepted. The slug belongs exclusively in the URL.

Progress DTOs expose only `bookId`, `chapterNumber`, optional `verseNumber`, `lastReadAt`, `revision`, `createdAt`, `updatedAt`. History DTOs expose only `id`, `bookId`, `chapterNumber`, optional `verseNumber`, `visitedAt`, `createdAt`; internal ownership, event keys and revision metadata are omitted.

The progress list is bounded by the existing ten canonical books and needs no pagination. History follows the private-library convention: page 1, limit 20 by default, limit 1–50, page 1–10,000; `pagination` contains `page`, `limit`, `total`, `pages`. Visits sort by `visitedAt` descending, then `_id` descending for deterministic ties. Optional exact `bookId` filtering is owner-scoped. Unsupported, repeated or operator/nested query fields are rejected. Offset pages and counts are not a snapshot during concurrent writes.

## Atomic progress, history and retries

Each new accepted checkpoint advances progress and inserts exactly one history event **in the same transaction**. Initial writes use an atomic upsert filtered by authenticated user, canonical book and revision 0. Updates compare the supplied expected revision and increment it atomically. A concurrent first insertion is arbitrated by the unique user/book index. Conflicting or stale revisions return 409 rather than overwriting newer progress or appending misleading history.

The user/event unique index makes duplicate request bodies safe, including simultaneous initial requests and retries after a lost response. A matching replay returns current progress with `replayed: true`; it does not move progress backward, advance its revision, refresh read time or add a visit. A reused key with a different location, book or expected revision returns 409. Different users may independently use the same event ID.

History insertion failure rolls back the progress change. Replica-set or sharded transactions are required for writes, as supported by MongoDB Atlas. On a standalone MongoDB deployment, initialized read endpoints remain available, but saving returns 503 rather than splitting progress/history into uncoordinated writes. Readiness checks fail closed if required collections/indexes are absent or a TTL index is present. Authentication, bookmarks/notes and public reading have separate readiness checks and remain independent of these new indexes.

There is **no automatic retention or deletion policy**, no TTL index, no timer-driven cleanup and no history mutation endpoint. No user history is silently deleted. A future retention/deletion feature must have its own product policy and authorization.

## Frontend behavior

- A loaded chapter opening or deliberate verse selection schedules a checkpoint after **one second** of quiet navigation. Rendering verses and scrolling do not create events. Rapid changes cancel superseded pending intents; React effect cleanup cancels unmounted pending work. Reader inputs/notes changing without a location change do not reschedule progress.
- One shared coordinator serializes checkpoint writes, including between books. It checks the latest intent after asynchronous reads and ignores superseded completions. An already in-flight write is allowed to finish before the newest queued intent; cancellation never assumes that a server write was rolled back. Server revisions protect races with other devices.
- Each new meaningful opening has a new event ID, including deliberately revisiting an already saved location. This refreshes `lastReadAt` so the global Continue reading entry points to the most recently visited book. Repeated requests for that same event are deduplicated by the server.
- A conflict is shown and is not automatically retried over another device's update. The reader can deliberately choose **Save this location again**, which fetches current progress before saving. If the target is already current, that retry simply confirms it, avoiding another visit after an ambiguous network failure.
- The coordinator captures the existing auth service's opaque session version across its read/write sequence. Logout/login or expiry cannot retarget an old pending location into a different account. The existing private-request response epoch guard also rejects late responses from older sessions. No token is exported to the reading service.
- The Testament page displays a Continue reading section, ordered by recent book activity, with stable resume links. Individual book pages show that book's saved location. Without progress, Start reading links to chapter 1 (Inquiry for the global fallback).
- Resume links use the existing `/testament/:book/:chapter/:verse` route. The existing reader selects the saved verse; a verse-specific deep link brings that verse into view once after the chapter loads. Manual subsequent selection does not trigger route scrolling. Canonical strings and editorial rendering remain untouched.
- `/reading/history` shows private visits newest first, paginated, with exact chapter/verse links and UTC timestamps. Book-specific history links use `?bookId=freedom`. Account settings and reader controls link to history; account settings also links to Continue reading.
- Loading, empty, saving, saved, error, conflict-retry and login guidance states are provided. A failure to save never blocks public manuscript rendering. A 401 prompts login; the existing login return path brings readers back to the originating reading location.

MongoDB is authoritative. Browser state contains only transient request/UI state and returned checkpoint metadata; no canonical text, activity database or authoritative progress/history is placed in browser storage. Existing manuscript services still supply reader content. Existing auth limitations remain: a page reload requires login again and automatic access-token refresh is not implemented. Stored progress/history persists across fresh sessions/devices.

## Ownership and request defenses

Every progress/history query and mutation includes `user: auth.user._id`; headers, body/query IDs and JWT role claims cannot replace the middleware-derived owner. The book is never treated as sufficient authority without the owner. A reader cannot get or change another account's progress or history by supplying IDs. There is no administrative override, public activity feed, analytics integration or shared history.

PUT requires an allowed Origin, `X-CSRF-Protection: 1` and `application/json`. It uses the established bounded process-local limiter at 300 writes per IP per 15 minutes; counters are not shared between server instances. Private activity paths participate in the existing CORS, no-store/error and development-log suppression policies, including case-insensitive path matching. Current user/session activity is checked at request authentication time, with the same ordinary request-time revocation semantics as other private resources.

## Deployment initialization

Using the deployment's existing approved database configuration, run from `backend`:

```powershell
npm run auth:init
```

The existing initializer now creates `readingprogresses` and `readinghistories` and all declared indexes alongside earlier account/private collections. It is repeatable and seeds no account or manuscript data. No backfill is required for a new installation. Conflicting manually created indexes or duplicate progress/events require a deliberate migration; initialization will fail rather than silently drop indexes or delete records. No Atlas initialization or real mail delivery was performed for this task.

## Validation and limits

- New backend checks: **17 passed**, including creating/retrieving/updating, optional verse clearing, uniqueness, concurrent first/update races, simultaneous duplicate requests, stale revisions, replay after newer progress, transaction rollback, invalid references, unresolved slots, chronological pagination, user isolation, injected ownership, inactive/revoked/anonymous access, CORS/CSRF/media policy, missing indexes, real frontend-to-HTTP integration and unchanged public/canonical content.
- Complete backend suite: **192 passed**, zero failures, cancellations or skips. Earlier auth, bookmark/note and manuscript tests remain intact; no existing test was changed or weakened.
- Complete frontend suite: **45 passed**, zero failures, cancellations or skips (11 new tests). Checks cover authenticated transport, strict response contracts, resume links/fallbacks, debounce/cancellation, deliberately repeated visits, late reads, serialized pending writes, conflict retries, session changes, route-selected saved verses and history/status markup.
- Frontend lint and the final production build passed. All **32 manuscript consistency checks passed**, all **10 data files remained unchanged**, and `databaseModified` and `importApproved` remained false. The existing Vite bundle-size warning remains; no unrelated bundling refactor was performed.
- Task-scoped whitespace checks passed. The preexisting unrelated workspace changes were preserved.
- Browser connection was unavailable. Service, coordinator and rendered-markup tests do not establish visual or browser click/scroll evidence; no end-to-end browser result is claimed.
- No manuscript ingestion, canonical text, edition, publication, dependency or secret changes were made. The older API PDF and Task 8 report remain dated snapshots; this document describes Task 9.

## Task 9 file inventory

Created:

- `backend/src/models/readingLocation.js`
- `backend/src/models/ReadingProgress.js`
- `backend/src/models/ReadingHistory.js`
- `backend/src/services/readingStorage.js`
- `backend/src/services/reading.service.js`
- `backend/src/controllers/reading.controller.js`
- `backend/src/routes/reading.routes.js`
- `backend/tests/reading-activity.test.js`
- `backend/docs/READING_PROGRESS_AND_HISTORY.md`
- `frontend/src/services/reading.service.js`
- `frontend/src/features/reader/utils/readingCheckpoints.js`
- `frontend/src/components/reading/ContinueReading.jsx`
- `frontend/tests/reading-activity.test.mjs`

Modified (including filled existing empty scaffolds):

- `backend/src/utils/canonicalReference.js`
- `backend/src/services/authStorage.js`
- `backend/src/config/auth.js`
- `backend/src/app.js`
- `backend/scripts/initialize-auth-storage.js`
- `backend/docs/AUTHORIZATION.md`
- `frontend/src/services/api/client.js`
- `frontend/src/services/auth.service.js`
- `frontend/src/hooks/useReadingProgress.js`
- `frontend/src/features/reader/components/LibraryLoginPrompt.jsx`
- `frontend/src/features/reader/components/ReaderControls.jsx`
- `frontend/src/components/reading/ReadingProgress.jsx`
- `frontend/src/components/reading/ReadingHistory.jsx`
- `frontend/src/pages/Reading/ReadingHistory.jsx`
- `frontend/src/pages/Testament/Testament.jsx`
- `frontend/src/pages/Testament/BookPage.jsx`
- `frontend/src/pages/Testament/ChapterPage.jsx`
- `frontend/src/features/account/AccountSettingsForm.jsx`
- `frontend/src/routes/AppRoutes.jsx`

Other workspace changes predate this task. Temporary verification logs and generated build output are not implementation source files.
