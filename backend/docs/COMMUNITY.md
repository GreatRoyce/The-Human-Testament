# Community implementation and deployment

Task 11 adds discussions, flat comments, public/private reading circles, invitations, reporting and audited moderation. Community records live in their own MongoDB collections. No canonical dataset, ingestion script, edition, publication approval, private note, bookmark, reading checkpoint or search index is modified by a community operation.

## Storage and architectural decisions

Existing CommonJS/Mongoose model and Express middleware conventions are retained. The community service handles validation, permissions and transactions; routes handle HTTP envelopes and middleware. React uses the existing API client, authentication closure, `useResource`, `ResourceState`, `ContentPage` and Button. No dependency was added. The existing string-only account-input validator cannot validate numeric chapter references or enums, so community input uses a strict field allowlist with explicit types.

| Model | Fields and rules |
| --- | --- |
| Discussion | Immutable author, optional immutable canonical book/chapter/verse and circle, title up to 160 UTF-16 units, body up to 10,000, visibility `public` or `circle`, status `active`, `locked`, `hidden`, `deleted`; timestamps. General, book, chapter and verse discussions supported by API. The UI supports general and verse-linked creation. |
| Comment | Immutable discussion and author, body up to 5,000, status `active`, `hidden`, `deleted`; timestamps. Flat replies only. |
| ReadingCircle | Immutable owner, name up to 100, optional description up to 2,000, immutable visibility `public`/`private` and membershipPolicy `open`/`invitation`, status `active`/`archived`; timestamps. Private circles require invitations. |
| CircleMembership | Immutable circle/user, role `member`/`moderator`/`owner`, status `pending`/`active`/`removed`, optional joinedAt, server-controlled blocked flag; timestamps. Real unique `{circle:1,user:1}` index. |
| ContentReport | Immutable reporter and targetType/targetId, optional immutable circle for access filtering, reason `spam`/`harassment`/`hate`/`other`, optional details up to 1,000, status `open`/`reviewed`/`resolved`; timestamps. Unique reporter/type/target index deduplicates for the target's lifetime. |
| ModerationAction | Moderator, target type/id, action, required reason up to 1,000, previous/resulting status and createdAt. Application writes append records; no HTTP update/delete exists. This is an application audit, not a tamper-proof external log. |
| CommunityModerator | Unique immutable User reference, operator identity and grant reason, timestamps and optional revocation time/operator/reason. Operator CLI only; the User role remains `user`. Revoked grants remain stored. |

Text is plain text, preserved apart from trimmed titles and circle names. Required text must contain non-whitespace. Canonical references use the existing PDF-derived `canonicalReference` checks, including unresolved reference slots without inventing their text. A verse requires the matching book and numeric chapter. API DTOs project only display name and account ID for authors; no emails, password hashes, sessions, private notes, report identities or Mongoose internals enter ordinary community responses.

Explicit initialization creates all seven collections and named lookup/unique indexes. Readiness checks fail closed if collections/indexes are missing, a unique constraint is weakened, or a community collection has an automatic TTL deletion index. Existing account and manuscript routes do not depend on community initialization. Writes reuse the existing transaction-capability check and snapshot/majority transaction options. Circle and discussion mutation writes serialize against membership revocation, archival and discussion locks; content state and moderation audit commit or roll back together.

## Permissions and lifecycle

- Anonymous and unverified readers may read public discussions, public-circle descriptions/discussions, and active public comments. Supplied invalid/expired credentials fail closed instead of falling back to anonymous access.
- Every write requires an active authenticated account, verified email, an allowlisted Origin, `X-CSRF-Protection: 1`, and JSON. Inactive accounts lose authenticated access through the existing account/session checks. No new community suspension flag or public account-administration process is introduced; separately authorized existing account deactivation can disable an account.
- Authors edit their own active discussions/comments. Circle edits require active circle membership and an active circle. Authors can withdraw visible own content even when its discussion is locked or circle archived. Request data cannot change authorship, passage, circle, roles, moderation status or timestamps. Authorized moderators remove content through the audited moderation endpoint rather than rewriting another reader's words.
- A locked discussion remains readable but rejects comments and edits. Hidden/deleted discussions return the same resource-not-found error as nonexistent discussions and suppress their comments. Hidden/deleted comments disappear from lists and active comment counts. Soft-deleted bodies and child comments remain internally for moderation; removal is not permanent erasure. Deleted content cannot be restored. Hiding a locked discussion preserves its lock when restored.
- General discussion lists contain general public discussions. Circle discussions are read with `circleId`; public-circle discussions are publicly readable, private-circle discussions require active membership. Circle rosters require membership or ownership, including for public circles. A global moderator also needs private-circle membership or ownership to access its content, reports and audit.
- Public open circles can be joined. Invitation-policy circles require a pending invitation. Owners invite by a reader-supplied account ID; no account directory, email disclosure or notification delivery is added. Invitation lists disclose only invitation metadata to their recipients, with description omitted. Recipients accept with join or decline with leave. Owners can withdraw pending invitations. Revoked/removed members cannot join again until the owner issues a new invitation; members who leave voluntarily may rejoin an open active circle. Rejoining does not retain moderator privileges.
- Only the immutable owner changes circle details, archives it, invites/removes members, or promotes/demotes a circle moderator. Client role input is rejected. Owner membership cannot be reassigned. Leaving as owner atomically archives the circle and removes active owner membership. Ownership remains for accountability, and the owner retains read/moderation access to archived private content. No ownership-transfer or unarchive capability exists. Other active members may read archived discussions, leave, and use authorized moderation; posting and joining stop.
- Circle owners/moderators can moderate their circle and review its report queue by `circleId`. Global moderators can use the general report queue, with private-circle access filtered before counting/pagination. Ordinary members cannot use either moderation scope. Nobody can review their own report or moderate their own content; a peer must handle these cases. Reporter identity is omitted even from queue responses. Authorized queue entries include current reported content for review, including hidden/deleted text.
- Moderation supports hide/restore for discussions and comments, lock/unlock for discussions, irreversible soft removal, and report review/resolution. Every action needs a reason and creates an audit entry in the same transaction. There is no endpoint to create a global moderator, change a User role, erase audits, or suspend arbitrary accounts.

## API

Success uses `{success:true,data:...}`; single resource responses use `data.item`, lists use `data.items` and `data.pagination`. Errors use the existing safe middleware. All community responses are `Cache-Control: no-store`; community routes use the existing credentialed CORS allowlist.

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/api/discussions` | List/create general or circle discussions |
| GET, PATCH, DELETE | `/api/discussions/:id` | Read/edit/withdraw a discussion |
| GET, POST | `/api/discussions/:id/comments` | Paginated comments/create flat comment |
| PATCH, DELETE | `/api/comments/:id` | Edit/withdraw own comment |
| GET, POST | `/api/reading-circles` | Browse/create circles |
| GET, PATCH | `/api/reading-circles/:id` | Read/owner update or archive |
| POST | `/api/reading-circles/:id/join` | Join open circle/accept invitation |
| POST | `/api/reading-circles/:id/leave` | Leave/decline invitation; owner archives |
| GET | `/api/reading-circles/:id/members` | Member-only paginated roster |
| PATCH | `/api/reading-circles/:id/members/:userId` | Owner actions: `invite`, `remove`, `promote`, `demote` |
| POST | `/api/reports` | Report an actually visible discussion/comment |
| GET | `/api/moderation/capabilities` | Current session's global moderator capability; false anonymously |
| GET | `/api/moderation/reports` | Authorized queue, optional circle scope |
| PATCH | `/api/moderation/reports/:id` | `{status: reviewed|resolved, reason}` |
| POST | `/api/moderation/actions` | `{targetType, targetId, action, reason}` |
| GET | `/api/moderation/audit` | Authorized paginated target history |

List page defaults to 1, limit to 20; maximum page 10,000 and limit 50. Discussions sort newest first with `_id` tie-breaker; comments and rosters oldest first with `_id`; reports oldest first and audits newest first. Stable ordering uses these timestamps/IDs; offset pages are not a frozen snapshot while new records arrive. Database list/count operations have a five-second budget. Queue and personal-circle filtering uses aggregation before pagination and does not gather all memberships into application memory.

Discussion filters: `bookId`, `chapterNumber`, `verseId`, `circleId`, `status` (`active`/`locked`). Chapter/verse filters require consistent book/chapter fields. Circle list `scope=mine` includes active memberships, including archived circles; `scope=invitations` includes pending invitations. The default lists active public circles. Report queue filters: status and optional circleId. Audit requires targetType (`discussion`/`comment`) and targetId. Unknown, repeated, nested and malformed list parameters are rejected; writes reject query parameters and unknown body fields. Resource IDs are exact lowercase 24-character hexadecimal IDs.

Rate limits use the existing bounded process-local limiter. All community requests have a 180/IP/15-minute ceiling. Each mutation route additionally has a per-account limit, and an IP ceiling three times that value: discussion create 20; discussion edit/withdraw 40; comment create 40; comment edit/withdraw 60; circle create 5; circle edit 30; join/leave 20; membership changes 40; reports 10; moderation actions/review 60. Invalid attempts reaching a limiter and duplicate reports count. Limits are per route and shared across IDs/IP changes for the same account, not distributed across server instances. Duplicate reports return the existing ID/status with 201 and never overwrite the original details.

## Frontend

Routes: `/community`, `/community/discussions`, `/community/discussions/:id`, `/community/reading-circles`, `/community/reading-circles/:id`, `/community/moderation`. Reader controls link a selected verse directly to its discussion filter; account settings link to community. Canonical content is linked back to its existing reader and is not copied into editable community records.

The UI provides discussion and comment forms, own edits/withdrawals, reports, public/my/invited circle lists, private invitations, join/leave, owner member management/archival, global and circle report queues, reasoned moderation and target audit inspection. Account IDs for invitations are visible only for the signed-in reader's own identity and public author references. Ordinary readers have no moderation controls. Loading/empty/error/retry/login/verification states reuse existing components. React text nodes and textareas escape UGC; no HTML injection or Markdown renderer is used.

Community transport reuses the authentication closure, never exports its token, permits anonymous GET, strictly restricts destinations, and rejects late responses after a session change. Anonymous identity checks no longer advance the session version repeatedly; late identity failures cannot clear a newer login. Credentials remain in memory. The existing lack of automatic access renewal persists: token expiry or a full reload requires login again. `VITE_API_URL` must point to the configured backend even when manuscript reading uses the local PDF provider.

## Deployment: posting remains off

No production data initialization, grant, account seed, email, environment edit or posting enablement was performed by Task 11.

1. Deploy to transaction-capable Atlas/a replica set, with existing auth initialized and functional. Retain the existing JWT secret, HTTPS, origin allowlist and email-verification delivery configuration. Confirm the intended database before running initialization.
2. Run `npm run community:init` from backend. This creates only community collections/indexes. It fails on conflicts instead of deleting duplicates or dropping existing data. Existing auth initialization is unchanged. There is no canonical migration.
3. Through the separately authorized operator process, provision an existing active, verified account: `npm run community:moderator -- grant USER_ID OPERATOR "Review reason"`. Use `revoke` with the same arguments to record revocation. There is no seeded/default user. A revoked grant is retained and cannot be re-granted by this CLI; reinstatement needs a separately reviewed operator migration. Provision peer moderators so self-report/content conflicts can be handled. The readiness gate considers at most 100 unrevoked grants.
4. Review permissions, staff moderation, and exercise public/private circle and report workflows in staging. For multiple application instances, add shared edge/distributed rate limiting; current counters reset on restart. Set request/body/time limits at the proxy and preserve accurate client IP configuration. Audit retention, backups, operator access, privacy/erasure policy, moderation policy, and monitoring remain deployment responsibilities. Automated tests do not replace an independent security review.
5. Only after these checks, explicitly set `COMMUNITY_POSTING_ENABLED=true` through the deployment configuration. It is off when absent or any other value. Content creation/editing, joining, membership changes and reports also fail closed unless at least one provisioned moderator is active and verified. Public reads, authorized moderation, own withdrawals and leave/decline remain available when posting is disabled. Missing storage still fails closed. No enablement was performed here.

There is no DM/chat, social login, upload, notification/email delivery, automatic suspension, ownership transfer, content revision history, or full-text community search in this release. Private notes and private-circle content never enter manuscript search. Audits and soft-deleted content have no automatic expiry. The application audit is protected by endpoint permissions; database operators still require separate access controls/backups. Browser interaction could not be verified because the in-app browser connection was unavailable; HTTP integration, contracts and server rendering provide automated evidence, not visual/user-interaction evidence.

## Validation

Baseline: backend 202 passed, frontend 51 passed. Final complete backend suite: **217 passed, 0 failed** (`npm test -- --test-concurrency=1`); dedicated community suite: **15 passed, 0 failed** (`npm test -- --test-concurrency=1 tests/community.test.js`). Final complete frontend suite: **56 passed, 0 failed** (`npm test`); frontend lint passed (`npm run lint`). The backend suite is serialized to avoid competing local MongoDB startups. Tests use only disposable loopback MongoDB replica sets, synthetic accounts and disabled email delivery. Existing tests are retained unchanged. The initial restricted frontend run could not start child processes; rerunning with the test runner's permitted process access passed.

New backend tests cover authenticated/verified writes, strict schemas, canonical references, pagination, ownership, comment CRUD, locks/hiding/removal, public/private circle and invitation rules, unique memberships, promotion boundaries, owner archival, scoped report review, privacy-filtered moderation queues, rate limits across IP changes, deduplication, audit creation/rollback, production gating, inactive/revoked access, missing unique indexes, canonical API/hash preservation and search separation.

New frontend tests cover anonymous/protected transport, credential containment, session changes, strict response projections, circle/report/moderation request contracts, escaped scripts/event handlers, permission-dependent controls, identity verification notices, loading/error/empty states, reader links and route server rendering. The fidelity check (`npm run fidelity:check`) passed **32 checks** with all **10 data files unchanged**, `databaseModified:false`, `importApproved:false`; its existing 206 source warnings remain. The final direct production build (`npm run build`) **passed with exit code 0**, including the PDF snapshot prebuild check; Vite emits a large-chunk warning. A prior redirected build completed compilation but PowerShell treated its stderr warning as a command error; the direct run confirmed the actual exit code. Operator scripts also passed syntax checks; no live provisioning was executed.

## Task 11 file inventory

Created backend files (15, including this report):

- `backend/src/models/communityFields.js`
- `backend/src/models/Discussion.js`
- `backend/src/models/Comment.js`
- `backend/src/models/ReadingCircle.js`
- `backend/src/models/CircleMembership.js`
- `backend/src/models/ContentReport.js`
- `backend/src/models/ModerationAction.js`
- `backend/src/models/CommunityModerator.js`
- `backend/src/services/communityStorage.js`
- `backend/src/services/community.service.js`
- `backend/src/routes/community.routes.js`
- `backend/scripts/initialize-community-storage.js`
- `backend/scripts/provision-community-moderator.js`
- `backend/tests/community.test.js`
- `backend/docs/COMMUNITY.md`

Modified backend files (3):

- `backend/package.json` — initialization/provisioning scripts only.
- `backend/src/app.js` — mounts community routes without changing manuscript routes.
- `backend/src/config/auth.js` — includes community paths in credentialed CORS, no-store error handling and development-log exclusions.

New frontend files (5):

- `frontend/src/components/community/CommunityUI.jsx`
- `frontend/src/components/community/ModerationQueue.jsx`
- `frontend/src/hooks/useCommunityIdentity.js`
- `frontend/src/pages/Community/Moderation.jsx`
- `frontend/tests/community.test.mjs`

Implemented existing empty frontend scaffolds (10):

- `frontend/src/services/community.service.js`
- `frontend/src/components/community/DiscussionCard.jsx`
- `frontend/src/components/community/DiscussionList.jsx`
- `frontend/src/components/community/DiscussionThread.jsx`
- `frontend/src/components/community/ReadingCircleCard.jsx`
- `frontend/src/pages/Community/Community.jsx`
- `frontend/src/pages/Community/Discussions.jsx`
- `frontend/src/pages/Community/DiscussionPage.jsx`
- `frontend/src/pages/Community/ReadingCircles.jsx`
- `frontend/src/pages/Community/ReadingCirclePage.jsx`

Modified existing frontend implementations (6):

- `frontend/src/services/auth.service.js` — bounded community transport and session-safe identity reads.
- `frontend/src/services/api/client.js` — existing safe error parsing for community paths.
- `frontend/src/routes/AppRoutes.jsx` — six community routes.
- `frontend/src/pages/Auth/Login.jsx` — permits community return destinations.
- `frontend/src/features/reader/components/ReaderControls.jsx` — passage discussion link.
- `frontend/src/features/account/AccountSettingsForm.jsx` — community link.

Total: 39 implementation/documentation/test files. Temporary local test logs are not shipped; generated ignored frontend build output is not source. Pre-existing changes from earlier tasks were preserved.
