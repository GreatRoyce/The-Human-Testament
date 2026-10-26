# Administration dashboard and moderation management (Task 15)

## Inspection and implementation plan

The backend uses CommonJS, Express 5, Mongoose 9, explicit collection/index initialization, active-user/session authentication, Origin/JSON/CSRF mutation protection, bounded process-local rate limiters, transactions and Node's test runner with disposable local MongoDB fixtures. The frontend uses React Router, `ContentPage`, `useResource`, strict Zod service contracts and existing community/article form components.

Verified existing capabilities before implementation:

- `User.role` permits only `user`. User account input cannot assign privileged roles.
- `AnalyticsGrant` already defines independently provisioned `owner` and `admin` grants for analytics. Neither implied platform administration.
- `CommunityModerator` separately governs global moderation. Reading-circle ownership/moderation is scoped to circles. Global moderators still need access to private circles.
- Discussions, comments, circles, content reports, article publication snapshots, moderation actions and in-app notifications exist.
- Article review enforces status/revision checks, required reasons and peer review. Approved publication snapshots and notifications are committed with the audit in a transaction.
- Community report review and moderation actions already use the shared `ModerationAction` log. Discussions/comments publish immediately; there is no prepublication moderation status or queue.
- Internal `setAccountActive` already revokes refresh sessions and recovery/verification credentials, but had no administrative HTTP caller.
- Task 14's aggregate analytics service/dashboard exists; it has independent configuration, storage readiness, privacy controls and explicit role grants.

Implementation followed this plan: extend the existing Admin grant with an opt-in administration permission; add protected user/overview/audit endpoints; reuse the existing account lifecycle in one audited transaction; consolidate the existing moderation/article workflows in a protected layout; reuse analytics; test permission, rollback, privacy and canonical boundaries. No second role table, moderation engine, audit collection or analytics collector was introduced.

## Setup and permissions

Administration is disabled unless `ADMINISTRATION_ENABLED=true` is explicitly configured on the backend. Existing authentication configuration and indexes must already be initialized. Account and permission writes require a transaction-capable MongoDB deployment (replica set/Atlas).

From `backend`, against the intended database configured through the existing `MONGODB_URI`:

```powershell
npm.cmd run admin:init
# If the intended administrator has no existing Admin grant, use the Task 14 operator process first:
npm.cmd run analytics:role -- grant admin TARGET_USER_ID OPERATOR_LABEL "Reason for Admin access"
# Explicitly enable administration on that existing Admin grant:
npm.cmd run admin:access -- grant TARGET_USER_ID ACTOR_USER_ID OPERATOR_LABEL "Reason for administration access"
```

`TARGET_USER_ID` and `ACTOR_USER_ID` are existing active verified User ObjectIds; operator labels/reasons are bounded strings. `ACTOR_USER_ID` attributes the out-of-band operator decision to an existing account. The trusted operator process can bootstrap the first administration permission; this is not a web self-promotion capability. No user, password, grant or metric is seeded by initialization. The CLI requires explicit invocation by a trusted database operator; ordinary HTTP administrators have no permission-assignment API.

Run `admin:access -- revoke TARGET_USER_ID ACTOR_USER_ID OPERATOR_LABEL "Reason"` to revoke this permission. It retains the Admin analytics grant and creates an audit entry. Idempotent grant/revoke requests do not create duplicate actions. The last active verified administrator cannot lose access through this process. The older analytics-role revocation command now refuses to revoke an Admin grant while administration permission remains enabled and shares the access lock when initialized.

`admin:init` creates the administration coordination document and initializes the existing grant/audit indexes, including the new `moderation_recent` chronological index. Rerunning it preserves audit history and existing grants. It does not initialize unrelated manuscript or optional analytics collections. Existing community target-scoped moderation does not depend on the new chronology index; the new administration service requires it. Existing conflicting indexes require an operator-reviewed migration; no automatic index deletion occurs.

Use existing `community:init`, `notifications:init` and `articles:init` when those features' storage has not yet been initialized. An administrator needs a separately provisioned `CommunityModerator` grant to use article review or community moderation; use the existing `community:moderator` process. Approval still requires the existing posting gate, an active verified moderator, and `COMMUNITY_POSTING_ENABLED=true`. This task never enables that gate or bypasses publication approval. Owner analytics grants do not confer administration access. Admin analytics grants without `administration: true` retain their prior limited access.

Task 14 configuration/initialization remains necessary for traffic reports. Its absence does not prevent account management or the rest of the overview. The existing analytics-role CLI now checks only its grant storage when provisioning roles, so `admin:init` suffices for the operator steps above even with traffic collection uninitialized/disabled. Report and ingestion readiness still require all original analytics storage. No new frontend environment variable or dependency is needed; the existing `VITE_API_URL` is reused. The account-settings Administration link appears only after a successful server capability check. Direct navigation is `/admin`.

No deployment initialization, permission provisioning or real account changes were performed while implementing/testing this task.

## Administration features

| Browser destination | Behavior |
| --- | --- |
| `/admin` | Live total/recent users, active/deactivated accounts, accessible outstanding reports, pending article submissions, recent accessible audit entries, existing traffic metrics and scoped health indicators |
| `/admin/users` | Literal name/email search, account-status and grant/role filters, registration-date filters, bounded pagination |
| `/admin/users/:id` | Projected account identity/registration/status/granted permissions, confirmed activation/deactivation, account and administration-permission histories |
| `/admin/articles` and `/admin/articles/:id` | Existing article queues, content/metadata preview, confirmed revision-bound approval/rejection/unpublishing/archival, approved snapshots and full accessible review audit history |
| `/admin/community` | Existing moderation queue with a discussion filter, reported context and confirmed moderation actions; comments can be selected using the filter |
| `/admin/reports` | Existing report queue, status/type/reason/date filters, review/resolution/dismissal with reasons |
| `/admin/audit` | Append-only accessible account/permission/content decisions, type/action/date filters and pagination |
| `/admin/analytics` | The existing Task 14 Admin analytics dashboard, retaining its existing independent analytics authorization |

The administration layout gates child mounting on the server capability request, uses one existing `ContentPage`/main heading, and provides responsive navigation. The standalone analytics route keeps its established authorization; following its Administration link requires the additional administration permission. Public reader layouts are unchanged. User-entered names, article text and audit reasons render as escaped text.

Accounts expose only ID, display name, email, base role, active/verification state, registration/update dates and booleans describing grants. Email is used for administrative account identification/search. Password hashes, password-change metadata, token/session records, private notes, bookmarks and private reading activity are never returned. A displayed grant on an inactive account describes the retained grant, not usable authenticated access.

The `user` filter is explicitly the base User role, currently shared by all accounts. Owner/Admin filters refer to live existing analytics grants, Moderator to the existing global grant, and Administration to the new explicit permission on the existing Admin grant. No HTTP role editing is offered: capability `roleManagement` is false, role/permission fields are rejected in status input, and no role-change endpoint exists.

Recent registrations cover the rolling last seven days. User counts come from MongoDB aggregation. Pending articles and outstanding reports are live counts from existing services, shown only with moderator access. Report totals include only open/reviewed reports within the actor's existing circle visibility. Unavailable dependencies and absent permissions are reported as unavailable, never as invented zero counts. The absent discussion/comment prepublication queue is explicitly explained rather than fabricated.

Health means the authenticated session and required administration indexes are ready at the request time, plus the optional features' checked availability. It is not an SMTP, worker, external infrastructure or historical uptime monitor. Metrics can change between individual live queries.

## API, validation and account safety

New endpoints:

| Endpoint | Access / input |
| --- | --- |
| `GET /api/admin/capabilities` | Active verified account plus live Admin grant with administration permission; no query parameters |
| `GET /api/admin/overview` | Same access; no query parameters |
| `GET /api/admin/users` | `page`, `limit`, `q`, `role`, `status`, optional paired `start`/`end` |
| `GET /api/admin/users/:id` | Strict ObjectId; no query parameters |
| `PATCH /api/admin/users/:id/status` | `{isActive: boolean, expectedIsActive: boolean, reason: string}` only; no query parameters |
| `GET /api/admin/audit` | `page`, `limit`, `targetType`, `targetId`, `action`, optional paired `start`/`end` |

Every real new endpoint checks current authentication, active/verified state, feature readiness and a live administration permission. JWT/body role claims do not grant access. Unsupported methods/paths retain the existing 404 contract, including attempted root `/api/admin` manuscript writes.

Pagination is positive-decimal page 1..10000 and limit 1..50, default 20. Name/email queries are literal escaped text, at most 100 characters, never client-provided regular expressions or MongoDB filters. Dates are real inclusive UTC `YYYY-MM-DD` pairs, ordered, no later than today and at most 366 days. Duplicate, unknown, operator-like and malformed fields are rejected. Queries/aggregations have five-second execution limits and return projected, bounded results rather than every account or action in application memory. User search uses the existing indexes and bounded execution; large-scale deployments may need a dedicated literal-search index strategy.

Status mutations use the existing Origin allowlist, CSRF header and JSON guard. New administration endpoints are limited to 120 requests/IP/15 minutes; status writes additionally allow 20/actor/15 minutes. Existing article/community limits remain in force. Limiters use bounded process-local maps; distributed enforcement remains a gateway/shared-store deployment concern. Administration paths are no-store and excluded from application request logging and analytics ingestion. Proxy trust configuration is not changed.

Administrators cannot alter their own account status. Status changes carry an expected current boolean; stale UI decisions fail with 409 and require reload. No-op requests do not create a new audit or revoke credentials again. Significant changes require an explicit review/confirm step in the frontend and a nonblank bounded reason on the server.

`AdministrationState` is a shared transaction write lock for account-status and administration-permission changes. It prevents write skew when two administrators simultaneously try to disable one another or remove essential access. Authorization is rechecked after acquiring the lock. The last active verified account carrying the administration permission must remain. Direct trusted database migrations and legacy internal primitives are outside ordinary HTTP administrator authority; they must preserve these invariants too.

The existing account-lifecycle service now accepts an existing transaction. A status mutation, all refresh-session revocations, recovery/verification token invalidations and the new audit append commit atomically. Audit failure rolls back the account and credential changes. Reactivation revokes credentials as well and never revives old sessions or tokens; the account must log in again. Deactivation is a restriction, not deletion of community content or private records.

## Reused moderation and audit rules

Article and community actions continue to call their existing APIs/services; the dashboard does not create alternate transition endpoints or broaden moderator powers. Authors cannot approve/moderate their own content. Article decisions use the reviewed revision, required reason, existing state transitions, immutable approved snapshot and notification transaction. Reported article context links to the administration article review screen, with the same publication policy.

Report queries gained target-type, reason and UTC date filters, sharing the existing private-circle visibility predicate. Global moderation and the new cross-resource audit viewer filter private-circle material inside MongoDB before pagination/counting. Private discussion/comment/report audit reasons are withheld from non-members, including platform administrators/global moderators; current ownership or active membership is required. Missing/orphaned discussion/comment/report context is excluded from the global audit rather than assumed public. No private reading collections are consulted.

Report status remains `open`, `reviewed` or `resolved`. Resolution can represent dismissal or action taken; the required safe reason records the decision. Resolution does not itself remove content or restrict an account. Those are separately authorized actions. Repeating the same status is idempotent and does not append another audit or notification. Resolved reports cannot be reopened by changing them back to reviewed. Hidden/deleted/locked content transitions retain the existing server policy, with soft removal/history retention.

The existing `ModerationAction` collection is extended for account activation/deactivation and explicit administration permission grants/revocations. It records actor, target/type, action, timestamp, previous/resulting status, reason and source; operator provisioning also records the bounded operator label. New administration/permission actions and existing article/community/report decisions share this log. Existing history is retained without fabricated backfill; pre-existing external operator workflows are not retroactively reconstructed.

The model rejects updates, replacements, bulk writes, saved modifications and document/query deletions. Existing audit records have no TTL, and administration offers no audit write/delete endpoints. Ordinary administrators cannot rewrite history. These are application protections: a trusted MongoDB credential using raw collection operations can bypass Mongoose hooks. Production database access must be limited appropriately, with separate operator access/backup controls. Explanations should be safe moderation reasons; no credential fields, request headers, password hashes, private notes or session/token documents are copied into audit records.

## Files created or modified for Task 15

Created:

- `backend/src/models/AdministrationState.js`
- `backend/src/services/administrationStorage.js`
- `backend/src/services/administrationAccess.js`
- `backend/src/services/administration.service.js`
- `backend/src/routes/administration.routes.js`
- `backend/src/utils/moderationQuery.js`
- `backend/src/utils/moderationVisibility.js`
- `backend/scripts/initialize-administration-storage.js`
- `backend/scripts/provision-administration-access.js`
- `backend/tests/administration.test.js`
- `backend/docs/ADMINISTRATION.md` (this report)
- `frontend/src/services/administration.service.js`
- `frontend/src/components/admin/AdminLayout.jsx`
- `frontend/src/components/admin/AdminLink.jsx`
- `frontend/src/components/admin/AdminAudit.jsx`
- `frontend/src/components/admin/AdminOverview.jsx`
- `frontend/src/components/admin/AccountStatusForm.jsx`
- `frontend/src/components/articles/ArticleReview.jsx`
- `frontend/src/pages/Admin/Overview.jsx`
- `frontend/src/pages/Admin/Users.jsx`
- `frontend/src/pages/Admin/UserDetails.jsx`
- `frontend/src/pages/Admin/Articles.jsx`
- `frontend/src/pages/Admin/Community.jsx`
- `frontend/tests/administration.test.mjs`

Modified:

- `backend/package.json` (operator initialization/provisioning scripts)
- `backend/src/app.js` (administration router)
- `backend/src/config/auth.js` (private CORS/no-log namespace)
- `backend/src/models/AnalyticsGrant.js` (explicit opt-in permission on existing Admin grants)
- `backend/src/models/ModerationAction.js` (shared append-only audit extensions/index)
- `backend/src/services/accountLifecycle.service.js` (reuse a caller transaction)
- `backend/src/services/community.service.js` (report filters, shared visibility, idempotent/terminal resolution)
- `backend/src/services/communityStorage.js` (administration chronology index does not block existing target-scoped moderation)
- `backend/src/services/analyticsStorage.js` (grant-only provisioning readiness independent of traffic storage)
- `backend/scripts/provision-analytics-role.js` (preserve essential administration grants)
- `frontend/src/services/auth.service.js` (destination-restricted administration transport)
- `frontend/src/services/api/client.js` (safe administration error feedback)
- `frontend/src/services/analytics.service.js` (reuse its overview response schema)
- `frontend/src/components/community/CommunityUI.jsx` (shared two-stage confirmations and pagination label)
- `frontend/src/components/community/ModerationQueue.jsx` (filters, confirmation, administration article links)
- `frontend/src/pages/Articles/ArticleModeration.jsx` (reuse extracted review component)
- `frontend/src/routes/AppRoutes.jsx` (protected administration routes)
- `frontend/src/pages/Account/Settings.jsx` (authorized administration link)
- `frontend/src/pages/Auth/Login.jsx` (strict safe return destinations)
- `frontend/src/pages/Analytics/AnalyticsDashboard.jsx` (return link to administration)

Pre-existing Tasks 1-14 changes are preserved. No canonical ingestion scripts, editions, manuscript data, publication approval flags, environment secrets or dependency versions were changed. Build output is generated/ignored; temporary test logs are removed after validation.

## Verification and remaining dependencies

Focused backend tests use a disposable loopback replica set, synthetic accounts and disabled mail. They cover explicit permissions/denials/forged role claims, projection/search/filtering, status preconditions/CSRF, credential revocation and reactivation, audit rollback, article review/revisions/self-review denial, report actions/resolution, private-circle context/audit filtering, append-only persistence defenses, optional overview data, concurrent deactivations, last-access protection, rates and unchanged manuscript/private reading collections.

The browser skill was consulted; its runtime reported no connected browsers. Frontend tests use transport mocks and React server rendering via Vite. They validate contracts, restricted credentials/destinations, stale-session responses, safe error behavior, route gating, escaped content, dependency states and confirmation controls. They do not establish live browser interaction or visual/responsive verification.

Final verification:

| Check | Actual result |
| --- | --- |
| Backend focused `npm.cmd test -- --test-concurrency=1 tests/administration.test.js` | 13 passed, 0 failed after correcting audit-model immutable-default handling |
| Backend full `npm.cmd test -- --test-concurrency=1` | 270 passed, 0 failed: 257 existing tests and 13 administration tests, including the final private discussion/comment/report visibility assertions |
| Frontend full `npm.cmd test` | 77 passed, 0 failed: 72 existing tests and 5 administration tests |
| Frontend `npm.cmd run lint` | Exit 0 |
| Frontend `npm.cmd run build` | Exit 0; 303 modules, production output generated |
| Build's read-only manuscript precheck | All 32 checks passed; manuscript matches PDF; all 10 data files unchanged; `databaseModified: false`, `importApproved: false` |

The first full backend run caught the unsupported `/api/admin` write response changing from 404 to authentication failure. The router was corrected without weakening the existing authorization test; the final full suite passed. Existing 206 manuscript source warnings remain unchanged. Vite still reports the existing large bundle warning (about 2.92 MB minified JavaScript); no unrelated bundle refactor was attempted.

Database fixtures were isolated to disposable loopback MongoDB replica sets, with synthetic accounts and disabled mail delivery. No Atlas credentials or real database operations were used. Test listeners/storage were closed and temporary logs removed. Browser interaction/visual verification remains unavailable as described above.

Deployment still requires explicit initialization, the administration permission and any separate moderator/analytics configuration described above. There is no HTTP role management, prepublication discussion/comment queue, historical audit backfill or SMTP/worker health monitor.
