# Articles and essays (Task 12)

Articles are reader-authored editorial contributions stored independently of the manuscript. Approval authorizes an article's publication; it does not turn an interpretation into canonical text or an official author clarification. No manuscript data, ingestion, edition, approval, private-note, bookmark or manuscript-search implementation was changed by this task.

## Models and limits

`Article` uses immutable User authorship and an immutable server-generated slug. It has a trimmed required title (180 UTF-16 units), optional subtitle (300), required plain-text body (100,000), optional excerpt (600), optional cover URL (2,000), at most eight distinct normalized tag slugs (32 each), optional category, and at most twelve distinct canonical references. Categories are `essay`, `reflection`, `analysis`, `reading-guide`; the empty value means no category. Tags are trimmed/lowercased ASCII letters/numbers with internal hyphens. Rich text, Markdown processing and arbitrary HTML rendering are deliberately absent; line breaks are preserved as plain text.

References have required `bookId` and optional numeric `chapterNumber` and stable `verseId`. Existing PDF-derived validation checks actual books, chapters, verses and internal consistency. Verse references require matching book/chapter. Book-only and chapter-only references are supported. Existing unresolved verse slots remain references without invented manuscript text.

Statuses: `draft`, `pending_review`, `published`, `rejected`, `archived`. The model tracks a nonnegative revision, optional publishedAt, timestamps and a private latest review reason. Ordinary API DTOs contain only an author's account ID/display name, with an unavailable-account label after account deactivation. Email, credentials, sessions, internal document versions and moderation reasons do not appear in public article responses. Published list cards omit body/reference lists; published detail includes both.

`ArticlePublication` retains an approved snapshot with article/author/reviewer references, approved revision, slug, content, date and approval reason. A real unique `{article,revision}` index prevents duplicate versions. There are no HTTP update/delete endpoints for snapshots. These are application-retained records, not an external tamper-proof archive; database access/backup controls remain necessary. Embedded reference/content schemas explicitly disable version keys so Mongoose transaction rollback does not try to restore nonexistent embedded `__v` paths under strict mode.

Cover images use HTTPS raster URLs (`png`, `jpg`, `jpeg`, `webp`, `avif`) from exact origins configured through `ARTICLE_COVER_IMAGE_ORIGINS`, comma-separated. No origins are allowed by default; cover images are optional. Credentials, fragments, whitespace/control characters, executable schemes and SVG URLs are rejected. The application server never fetches cover URLs, and no upload/media-storage dependency was introduced. Published covers load in the browser with no referrer. Unsaved previews do not fetch cover URLs. Asset availability, origin ownership and image-provider redirects remain operator responsibilities; allowing an origin is a trust decision. No environment file was changed.

## Workflow and permissions

1. An active authenticated, email-verified user creates a nonempty draft. Authorship, status, slug and timestamps are derived on the server. Client attempts to assign them are rejected.
2. The author can edit a draft or rejected article. `expectedRevision` is required; stale edits return 409. Editing a rejected article returns it to draft and clears its current review reason. Slugs and authorship remain unchanged.
3. Submission requires expectedRevision, freezes editing and sets pending_review. Authors cannot approve themselves or set status through edit requests. Authors can archive an unpublished submission to withdraw it; a pending moderator approval then fails its revision/state check.
4. Only an existing, active verified account with a separately provisioned Task 11 CommunityModerator grant can review. Circle moderator/owner status alone grants no article publishing authority. A moderator cannot review their own article. Approval/rejection requires pending_review and the exact reviewed revision. A bounded, nonblank reason is required for every decision. Rejection returns the article to rejected and gives its author the reason.
5. Approval atomically publishes the article, increments revision, sets publishedAt, stores the approved snapshot and appends a Task 11 ModerationAction. An audit or snapshot failure rolls the entire decision back. Concurrent edits/reviews rerun revision checks rather than approving an unseen revision.
6. Published articles are read-only, including for authors. A peer moderator must unpublish first, with a reason. Unpublishing immediately removes the article from public access, returns it to draft and preserves all approved snapshots. Subsequent edits need resubmission and approval. Republishing retains the slug and adds another approved snapshot/date. `publishedAt` records the latest approval, including while an article is no longer public; status controls public visibility.
7. Authors can archive their unpublished articles; they cannot independently remove a currently published article. An author requesting unpublication can contact a moderator through an article report (`other` with details). Moderators can archive any non-archived article through review. Archival is soft retention, not permanent erasure, and has no restore endpoint. Authorship, approved snapshots and moderation history remain. Author withdrawal of an unpublished item changes its status/revision/timestamp; moderator decisions additionally create audit entries.

Drafts, rejected, pending and archived articles are visible only through an author's own management endpoints or global moderator endpoints. Public slug lookup always filters published status, even for the author. Foreign/malformed/missing owned IDs receive the same 404. Authors have private access to approved snapshots; moderators have a separate authorized snapshot view. All private reads use existing live account/session checks. Inactive accounts cannot authenticate; the existing authorized account-deactivation mechanism is reused, and no competing suspension/admin system is introduced. Deactivating an author does not silently remove an already approved article.

## API

Existing envelopes remain `{success:true,data:...}` with `item`, or `items` plus pagination; errors use the existing safe handler. Article responses use `Cache-Control: no-store`, including public responses so unpublication is not hidden behind an application HTTP cache. Community credentialed CORS/origin/CSRF protections now include `/api/articles`. Every mutation requires JSON, allowlisted Origin and `X-CSRF-Protection: 1`.

| Method | Path | Access/input |
| --- | --- | --- |
| POST | `/api/articles` | Verified author; content fields only; creates draft |
| GET | `/api/articles` | Public published list; optional tag/category/page/limit |
| GET | `/api/articles/:slug` | Public published detail only |
| GET | `/api/articles/mine` | Current author's list; optional status/page/limit |
| GET | `/api/articles/mine/:id` | Current author's full article and latest review reason |
| PATCH | `/api/articles/:id` | Owned draft/rejected content fields plus expectedRevision |
| DELETE | `/api/articles/:id` | Archive own unpublished article; JSON `{}` |
| POST | `/api/articles/:id/submit` | Owned draft/rejected; expectedRevision |
| GET | `/api/articles/moderation` | Global moderator queue; optional status/page/limit |
| GET | `/api/articles/moderation/:id` | Global moderator's complete review copy |
| POST | `/api/articles/:id/review` | Global moderator; action, reason, expectedRevision |
| GET | `/api/articles/mine/:id/publications` | Owner-only approved snapshots; page/limit |
| GET | `/api/articles/moderation/:id/publications` | Global moderator snapshots; page/limit |

Review actions are `approve`, `reject`, `unpublish`, `archive`. Status transitions and client revisions are validated on the server. Writes reject query parameters and unknown body fields. List queries reject unknown, nested, repeated or malformed parameters. Page defaults to 1, limit to 20; maximum page 10,000 and limit 50. Published ordering is publishedAt descending with `_id` tie-breaker; owned/history lists use createdAt descending and `_id`; moderation uses createdAt ascending and `_id`. Offset pages use stable ordering but are not a frozen snapshot while records change. List/count queries have a five-second budget. Public list/reading has no PDF or mock-data fallback when storage is unavailable.

Slug allocation uses a normalized ASCII title prefix (or `essay`) and 64 bits of random hex, backed by the real `article_slug_unique` index. Creation retries a slug collision up to five times; exhaustion returns a safe 503. There is no preliminary uniqueness check that could race. Slugs are reserved for all statuses, remain stable across title changes and are never recycled by archival. Management routes are registered before the public slug route.

Rate limits reuse the existing bounded process-local limiter: 180 requests/IP/15 minutes; draft creation 10/account, submission 10/account, editing 40/account, archival 30/account and publication decisions 60/account, each also with an IP limit three times its account limit. Article reports retain the existing report limits (10/account/IP-scaled per 15 minutes) and unique reporter/target deduplication. Failed requests reaching a limiter count. Limits reset on restart and require shared edge/distributed enforcement before scaling across instances.

## Existing moderation integration

Task 11 ContentReport now permits targetType `article`. `POST /api/reports` accepts only an actually published article visible through the public policy; guessed draft IDs cannot be reported to probe their existence. Lifetime deduplication, rate limits, reporter secrecy, review states and self-report-review restrictions remain unchanged. Article reports appear in the existing global report queue, never a circle-scoped queue. Authorized moderators can see the reported article's current review context there, including after it was unpublished; ordinary users cannot.

The queue links to article publication review. Task 11 ModerationAction now permits article targets and approve/reject/unpublish/archive actions, recording the exact article revision internally. `GET /api/moderation/audit?targetType=article&targetId=...` provides the existing paginated moderator audit view. Generic community hide/restore calls reject article targets, directing callers to revision-aware publication review. Report review/resolution still uses the existing endpoints/audits; there is no second reporting, moderator-grant, or audit subsystem.

The previous community posting gate was moved unchanged into shared middleware. The existing `COMMUNITY_POSTING_ENABLED=true` gate plus an active verified provisioned moderator is required for creating/editing/submitting articles and approving publication. It remains off when unset. Author archival, rejection, unpublishing and moderator archival remain protected but available when posting is off. No production flag was enabled and no moderator/user was seeded.

## Frontend and discovery

Routes: `/articles`, `/articles/:slug`, `/articles/mine`, `/articles/write`, `/articles/mine/:id`, `/articles/moderation`, `/articles/moderation/:id`. Community navigation links to public articles; signed-in article navigation links to writing/management; moderator navigation shows article review only when the existing capability endpoint grants it. Account settings link to My articles, and login accepts article return destinations.

The editor uses existing page/form/Button/API/resource conventions with controlled plain-text fields and no editor dependency. It supports title/subtitle/body/excerpt, bounded tags/category, an optional cover URL, book/chapter/verse reference lines, explicit saving, preview and review submission. Dirty writing must be saved before the submission control is offered. Validation/network/revision errors retain the current editor fields. The editor is not an offline store or autosave system: unsaved writing is lost on navigation/reload, as its instructions state. Preview is clearly unsaved; HTML/Markdown and links in prose remain plain text. React text nodes/textarea values escape script tags, event handlers and author-controlled markup. Canonical references link back to the existing reader.

Public discovery supports exact normalized tag/category filters and pagination. No article full-text search, feed merge, canonical search changes, automatic private-note publication or article-comment API is added. Existing manuscript search continues to search only manuscript/supporting categories. Article reporting uses the existing community report UI. There is no article upload, rich-text renderer, notification/email, comment/chat or direct messaging feature in this task.

The existing in-memory authentication closure now permits bounded article destinations, preserving anonymous GET, credential containment and rejection of stale responses after session changes. Access renewal remains unchanged: a reload/expired access token requires login again. `VITE_API_URL` must point to the configured backend, including when manuscript reading uses the local PDF provider.

## Initialization and remaining limits

Initialize existing authentication and Task 11 community storage/grants using their documented processes, then run `npm run articles:init` in backend against the intended database. It creates only Article/ArticlePublication collections and named lookup/unique indexes; it does not create accounts/articles/grants, rewrite existing records, drop conflicting indexes, or modify canonical collections. A conflicting/duplicate slug or snapshot index fails initialization and needs an explicitly reviewed operator repair. Existing auth/community initialization does not automatically depend on article storage; the existing backend remains usable without it. Requests fail closed on missing/weakened article indexes or unexpected TTL deletion indexes. No Atlas initialization was performed here.

Transactional changes/reviews require Atlas/a replica set or supported sharded deployment and reuse the existing snapshot/majority transaction options. Production posting remains under the existing disabled-by-default gate. Configure trusted image origins only if covers are needed; retain existing authentication secrets, HTTPS, origins and verified-email delivery. No environment secret or environment file was modified. Peer moderators are needed for conflicts involving a moderator's own work. Audits and publication history require retention, backup, database-access and privacy/erasure policies; there is no automatic TTL or permanent-erasure endpoint. Image availability, distributed abuse controls and production security review remain deployment responsibilities.

The in-app browser connection was unavailable (no browser connections discovered), so automated HTTP/contract/server-render checks are not a browser interaction or visual review. No live email, Atlas operation, publishing enablement or real account was used. Existing manuscript warning/approval limitations remain unchanged.

## Validation

Baseline: **217 backend tests passed**, **56 frontend tests passed**. Final complete backend suite: **232 passed, 0 failed** (`npm test -- --test-concurrency=1`); dedicated article backend suite: **15 passed, 0 failed** (`npm test -- --test-concurrency=1 tests/articles.test.js`). Final complete frontend suite: **60 passed, 0 failed** (`npm test`); frontend lint passed (`npm run lint`); production build passed with exit code 0 (`npm run build`). Its prebuild check passed **all 32 fidelity checks**, confirmed the shared manuscript matches the PDF, retained all **10 data files unchanged**, and reported `databaseModified:false`, `importApproved:false`. Existing 206 manuscript source warnings and Vite's large-chunk warning remain. Existing tests were preserved. MongoDB tests use isolated loopback replica sets, synthetic identities and disabled mail; backend runs are serialized to avoid competing local database startup timeouts.

Coverage includes owned draft creation/saving/editing, strict author/status input, concurrent revision conflicts, public draft exclusion through slug/ID/lists/report targets/search, submission/peer approval/rejection/unpublication, immutable approved snapshots and authorship, archival/withdrawal races, real unique slug collisions/retries, limits/tags/categories/images/reference validation, reporting/deduplication/account-based quotas, shared audits and rollback, disabled posting/revoked moderators/inactive users, missing index readiness, and unchanged canonical responses/source hashes.

Frontend tests cover anonymous/session transport, management field allowlists, draft/credential/reason leakage rejection, safe cover schemes, exact reference URLs, escaped article/editor content, preview behavior, existing page structure and route rendering. Development checks caught and corrected the embedded-schema rollback issue described above, control-character regex lint errors, and a new test using a synchronous assertion for an asynchronous rejection. Operator initialization scripts passed syntax checks; no real initialization is included in test claims.

## Task 12 file inventory

New backend files (11, including this report):

- `backend/src/models/Article.js`
- `backend/src/models/ArticlePublication.js`
- `backend/src/models/articleContent.js`
- `backend/src/utils/articleSlug.js`
- `backend/src/services/articleStorage.js`
- `backend/src/services/article.service.js`
- `backend/src/routes/article.routes.js`
- `backend/src/middleware/communityPosting.middleware.js`
- `backend/scripts/initialize-article-storage.js`
- `backend/tests/articles.test.js`
- `backend/docs/ARTICLES.md`

Modified backend files (7):

- `backend/package.json` — articles:init script.
- `backend/src/app.js` — article router mount.
- `backend/src/config/auth.js` — article path CORS/no-store/logging classification.
- `backend/src/routes/community.routes.js` — reuses extracted posting gate unchanged.
- `backend/src/models/ContentReport.js` — article target enum.
- `backend/src/models/ModerationAction.js` — article review actions/revision.
- `backend/src/services/community.service.js` — article report context/visibility/audit integration and existing author DTO reuse.

New frontend files (13):

- `frontend/src/services/articles.service.js`
- `frontend/src/features/articles/articleInput.js`
- `frontend/src/components/articles/ArticleContent.jsx`
- `frontend/src/components/articles/ArticleCard.jsx`
- `frontend/src/components/articles/ArticleEditor.jsx`
- `frontend/src/components/articles/PublicationHistory.jsx`
- `frontend/src/components/articles/ArticleFrame.jsx`
- `frontend/src/pages/Articles/Articles.jsx`
- `frontend/src/pages/Articles/ArticlePage.jsx`
- `frontend/src/pages/Articles/MyArticles.jsx`
- `frontend/src/pages/Articles/ArticleEditorPage.jsx`
- `frontend/src/pages/Articles/ArticleModeration.jsx`
- `frontend/tests/articles.test.mjs`

Modified frontend files (8):

- `frontend/src/services/auth.service.js` — bounded article session destinations.
- `frontend/src/services/api/client.js` — safe article error parsing.
- `frontend/src/services/community.service.js` — article report response schema.
- `frontend/src/components/community/ModerationQueue.jsx` — report links to article review.
- `frontend/src/components/community/CommunityUI.jsx` — article/review navigation.
- `frontend/src/routes/AppRoutes.jsx` — article routes.
- `frontend/src/pages/Auth/Login.jsx` — article return destinations.
- `frontend/src/features/account/AccountSettingsForm.jsx` — My articles link.

Total: **39 source/test/documentation files**. Temporary test logs and ignored build output are not shipped source. Pre-existing changes from earlier tasks were preserved; no dependency or lockfile changes were needed for Task 12.
