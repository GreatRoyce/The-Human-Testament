# Website analytics (Task 14)

Analytics are separate from canonical content, personal reading progress/history, bookmarks, notes and community activity records. Nothing imports historical traffic or infers it from those records. No dependency was added and no environment secrets, publication flags or real accounts were changed.

## Enable and initialize

Backend configuration (disabled unless explicitly enabled):

```text
ANALYTICS_ENABLED=true
ANALYTICS_ALLOWED_ORIGINS=https://your-reader-origin.example
ANALYTICS_RETENTION_DAYS=180
```

Origins are exact comma-separated frontend origins; HTTPS is required in production. Development alone permits HTTP localhost/127.0.0.1. Retention is an integer from 7 to 365 days, default 180. Reporting also needs the existing configured authentication system, initialized auth storage and an active session. Anonymous ingestion needs neither an account nor enabled authentication. Use the same frontend origin in the existing auth allowlist for signed-in collection and dashboard access.

Frontend build configuration:

```text
VITE_API_URL=https://your-backend-origin.example
VITE_ANALYTICS_ENABLED=true
```

Without the frontend flag there is no tracker, consent control or automatic capability lookup. Dashboard routes still return the server's authorization/unavailable state. No tracking starts merely from enabling configuration: each browser must explicitly opt in. Configure the actual retention and update the public privacy notice for the deployment before enabling collection. This implementation makes no claim of universal legal compliance.

Run from `backend` against the intended deployment database, using the existing `MONGODB_URI` configuration:

```powershell
npm.cmd run analytics:init
npm.cmd run analytics:role -- grant owner EXISTING_USER_OBJECT_ID OPERATOR_LABEL "Reason for access"
npm.cmd run analytics:role -- grant admin EXISTING_USER_OBJECT_ID OPERATOR_LABEL "Reason for access"
```

These commands were implemented but have NOT been run against Atlas. Initialization creates only `AnalyticsEvent`, `AnalyticsGrant` and `AnalyticsState` collections/indexes. The state records initialization time, not a fabricated first visit. It is safe to rerun and retains the original start time. All new models disable automatic collection/index creation. No other feature's readiness depends on these collections. An absent/malformed required index fails analytics closed. Existing conflicting indexes need an operator-reviewed migration; initialization does not drop indexes.

Indexes: unique event hash; ascending event time/path; TTL on `expiresAt` with `expireAfterSeconds: 0`; unique grant `(user, role)`. After changing retention, rerun `analytics:init`. It shortens existing expiry values as necessary without extending original expiry on increases. Reports enforce the configured time floor and expiry even before MongoDB's asynchronous TTL cleanup. Backups/logs require their own deployment retention policy. Grant/state metadata do not use TTL.

## Explicit Owner and Admin permissions

Inspection found `User.role` allows only `user`. Existing global community moderators have separate community grants, and reading-circle owners/moderators have only circle permissions. None of those confer analytics access.

`AnalyticsGrant` provides separate operator-managed `owner` and `admin` permissions, scoped only to analytics. Both roles can read site aggregate reports in their respective namespace. Only Admin reports include collection readiness/retention indicators. Owner cannot read Admin reports and Admin cannot read Owner reports without an additional explicit grant. There is no HTTP grant endpoint and no registration/profile input can grant these permissions. The CLI grants only to existing active verified users, never seeds a user or changes `User.role`.

Revoke using `analytics:role -- revoke owner|admin USER_ID OPERATOR_LABEL "Reason"`. Revoked grants are retained and deny the next request. Regranting a revoked `(user, role)` pair requires a separately reviewed operator migration, matching existing moderator provisioning policy. Session revocation/inactive accounts are checked by existing authentication on every report. Client/JWT role claims cannot substitute for a live database grant. Capability-driven links appear in account settings; browser routes are `/owner/analytics` and `/admin/analytics`.

## Collection and privacy

`POST /api/analytics/events` takes exactly:

```json
{
  "eventId": "UUID-v4",
  "visitorId": "UUID-v4",
  "sessionId": "UUID-v4",
  "path": "/testament/freedom/1/1",
  "referral": "search.example.test",
  "consent": true
}
```

Referrer is a public hostname or `null`, never a full URL. Server validates exact public paths against canonical references, and article detail paths against current published status. Content type, timestamp, authenticated boolean and expiry are server-derived; clients cannot override them. JSON is capped at 2 KB, query parameters/unknown fields are rejected, and ingestion requires an allowed Origin and CSRF header. Ingestion is limited to 120 requests/IP/minute, reports to 60/IP/15 minutes, with bounded process-local limiter maps. Proxy trust is not enabled by this feature; configure existing application proxy trust correctly for the actual deployment. A distributed deployment needs a shared limiter at the gateway or a future shared store. Limits are protection against mistakes/basic abuse, not authenticated proof that a human visited. A scripted client can forge public HTTP inputs, and bot lists cannot detect every bot.

The frontend stores an analytics consent choice, a random browser ID (fixed 90 day expiry), and a random session ID in tab session storage (30 minutes since last pathname attempt). Identifiers are created only after opt-in. The server stores SHA-256 hashes of high-entropy UUIDs, with event/session hashes namespaced to the browser ID. Identifiers are pseudonymous, not guaranteed anonymous. No fingerprinting or cross-site identity matching is used. No raw IP, device category, account ID/email, raw UUID, complete headers, query, fragment, search term, title, token, note or private reading record is persisted in event storage. The rate limiter uses bounded IP-keyed counters in process memory and removes expired buckets on subsequent requests. The app's request logger skips analytics paths; infrastructure access logs are separate and should be configured appropriately.

Authenticated activity has one explicitly defined purpose: count consented public page views with an active validated login separately from anonymous page views. The existing in-memory bearer credential is optionally supplied through a destination-restricted transport, validated against the current user/session and immediately discarded. The event stores only `authenticated: true/false`, never the user/session database ID or bearer token. Analytics requests omit cookies and cannot invalidate the application's session on collection failure. Anonymous ingestion never invokes auth readiness. Invalid/expired supplied credentials cause the event to be dropped, not reclassified silently as authenticated.

The controls default off and offer Allow / Keep analytics off. DNT (including legacy `yes`), GPC and unavailable browser storage override consent. Privacy signals are checked before each attempted view; server DNT/Sec-GPC headers also suppress events. Opt-out removes analytics IDs and stops future tracking. Previously accepted pseudonymous records remain until expiry; identifiers are not recoverable through a public API. Cross-tab preference changes are observed through storage/focus events. An already transmitted in-flight request may finish at withdrawal; there is no retry/offline queue or tracking-protection workaround.

Allowed pages: site home/contact/privacy/terms, search pathname only, Testament index/materials and valid books/chapters/verses, community listing pages only, article listing and currently published article detail. All account/auth/recovery/settings/notifications/saved-reading routes, circle/discussion detail IDs, drafts/moderation/editor routes, unknown pages, health/monitor endpoints and Owner/Admin screens are excluded. Known bots/crawlers/headless previews/monitors are suppressed transiently from User-Agent without storing the header. Authenticated Owner/Admin traffic is excluded server-side; logged-out administrators cannot be identified as administrators and may be counted if they opt in. Community moderators do not automatically become analytics administrators.

Deduplication: the singleton tracker watches React Router's pathname (not query/hash), so StrictMode effect replay, remounts, same-path query/hash changes and repeated calls do not create another view. Navigating A -> B -> A counts a deliberate revisit. Excluded paths also advance the last-path marker. A full document load counts a fresh view. A new UUID is used per accepted navigation attempt; concurrent replay of the same browser/event pair is protected by the unique database index. No automatic retries occur after failure, so outages can undercount but never block routing/reading. A session ID belongs to one browser ID; it rotates after inactivity or browser-ID rotation. Separate tabs count separate sessions. This is a page-view inactivity metric, not measurement of reading/scrolling duration.

## Metrics and report API

Authenticated GET endpoints under `/api/analytics/{owner|admin}`:

| Endpoint | Aggregate data |
| --- | --- |
| `/report` | All dashboard metrics/sections, coverage and date range |
| `/overview` | Current and previous metrics with percentage change |
| `/trends` | Daily, weekly or monthly views, sessions and browser estimates |
| `/pages` | Most visited public paths |
| `/content-types` | Views by server-derived page type |
| `/referrals` | Views attributed to referrer hostname/internal/direct-unavailable |
| `/activity` | Authenticated versus anonymous page views |

`GET /api/analytics/capabilities` returns only the current account's explicit permission booleans. There is no raw-event read endpoint, per-account breakdown or individual browsing-history report. Reports are `Cache-Control: no-store`.

Query: `days=7|30|90` (default 7) OR `start=YYYY-MM-DD&end=YYYY-MM-DD` inclusive dates, with `interval=day|week|month` (default day) and `limit=1..50` (default 10). UTC throughout, Monday week starts. Dates must be real, ordered, at most 90 days and no later than today. Duplicate/unknown parameters are rejected. Today and edge week/month buckets are incomplete. The previous comparable period is the immediately preceding equal number of UTC days; today is included in the selected preset, so current totals are provisional. No individual metric should be interpreted as a count of people.

- Page views: distinct accepted events in the range.
- Visits/sessions: distinct browser/session hashes active during the range, not just sessions that began there. A session crossing periods can appear in both.
- Estimated visitors: distinct consenting browser hashes active during the range. Multiple devices/profiles, cleared/blocked storage, 90 day rotation, missing consent and delivery failures affect the estimate.
- Trends: the same metrics within each UTC bucket, restricted to the selected range. Sessions/browser counts across buckets cannot be summed to produce period totals. Only buckets with events are returned/shown; missing buckets are not invented history. The table exposes exact dates and values beside the chart.
- Referrals: hostname attribution per page view from the document's initial referrer, with same-site referrals grouped as internal and absent values grouped as direct/unavailable; no campaign/query parameters or separate acquisition model.
- Change: `(current - previous) / previous * 100`, or null when previous is zero. The dashboard suppresses percentages if either period has incomplete initialization/retention coverage. Both raw totals remain visible and today's incomplete state is explicit.

Reports perform bounded MongoDB aggregation (`$match`, `$facet`, `$group`, `$dateTrunc`, top-N limits); they never fetch all raw events into Node memory. Each aggregation has a 10 second execution limit. The event-time index bounds scans; disk use is enabled for aggregation stages where MongoDB permits it. Distinct aggregation is appropriate for the current application; very large traffic would justify rollups/approximate cardinality storage. The section endpoints share the same aggregate computation, which favors consistent contracts over optimizing each small request. Reads are not snapshot transactions, so traffic arriving between counts and breakdowns can cause small live discrepancies.

Coverage reports earliest available window as the later of initialization and the current retention floor. Empty and partial states are explicit. There is no backfill from private activity and no fabricated sample metrics. Initialization time is an availability boundary, not evidence of uninterrupted collection: opt-out, disabled periods, bot exclusions, browser protections and outages can create further gaps that cannot be reconstructed. Comparisons should be interpreted as consented observed traffic, not a census.

## Files created or modified for Task 14

Created:

- `backend/src/config/analytics.js`
- `backend/src/models/AnalyticsEvent.js`
- `backend/src/models/AnalyticsGrant.js`
- `backend/src/models/AnalyticsState.js`
- `backend/src/services/analyticsStorage.js`
- `backend/src/services/analytics.service.js`
- `backend/src/routes/analytics.routes.js`
- `backend/scripts/initialize-analytics-storage.js`
- `backend/scripts/provision-analytics-role.js`
- `backend/tests/analytics.test.js`
- `backend/docs/ANALYTICS.md` (this report)
- `frontend/src/services/analytics.service.js`
- `frontend/src/services/analyticsTracker.js`
- `frontend/src/components/analytics/AnalyticsTracking.jsx`
- `frontend/src/components/analytics/AnalyticsLinks.jsx`
- `frontend/src/components/analytics/AnalyticsSummary.jsx`
- `frontend/src/pages/Analytics/AnalyticsDashboard.jsx`
- `frontend/tests/analytics.test.mjs`

Modified:

- `backend/package.json` (two operator scripts)
- `backend/src/app.js` (bounded parser and analytics router)
- `backend/src/config/auth.js` (independent analytics CORS and no-log/no-cache namespace)
- `frontend/src/App.jsx` (router-aware tracker/consent controls)
- `frontend/src/routes/AppRoutes.jsx` (two dashboard routes)
- `frontend/src/services/auth.service.js` (restricted analytics transport using existing in-memory session)
- `frontend/src/services/api/client.js` (safe analytics error messages)
- `frontend/src/pages/Account/Settings.jsx` (permission-based dashboard links)
- `frontend/src/pages/Auth/Login.jsx` (safe dashboard return destinations)
- `frontend/src/pages/Legal/Privacy.jsx` (collection/consent/retention notice)

Pre-existing Tasks 1-13 changes were preserved. Generated `frontend/dist` output is ignored. Temporary test logs are removed after verification.

## Verification

Focused backend tests: 12 passed, 0 failed, using a disposable loopback MongoDB replica set and synthetic accounts. The initial run exposed a test helper parsing an empty OPTIONS response; that helper was corrected. Tests cover event validation, replay uniqueness, real canonical paths/published article status, metadata privacy, consent/privacy signals, bot/admin exclusions, bounded queries/rates, independent roles/moderator denial/forged claims, revocation, aggregate windows, retention/TTL readiness, outage isolation and unchanged manuscript/private library data.

Final results:

| Check | Result |
| --- | --- |
| Backend `npm.cmd test -- --test-concurrency=1 tests/analytics.test.js` | 12 passed, 0 failed, including anonymous collection with auth disabled and real grant uniqueness/enum enforcement |
| Backend `npm.cmd test -- --test-concurrency=1` | 257 passed, 0 failed (245 existing plus 12 analytics tests) |
| Frontend `npm.cmd test` | 72 passed, 0 failed (64 existing plus 8 analytics tests) |
| Frontend `npm.cmd run lint` | Exit 0 |
| Frontend `npm.cmd run build` | Exit 0; 291 modules, production output generated |
| Build's read-only manuscript precheck | All 32 checks passed; manuscript matches PDF, all 10 data files unchanged, `databaseModified: false`, `importApproved: false` |

The full backend suite ran serially to avoid competing disposable MongoDB startup processes. Additional focused assertions were rerun successfully afterward. The final frontend suite includes both feature-disabled rendering and enabled consent controls using the project's existing Vite environment setup convention. Existing 206 manuscript source warnings remain unchanged; the production build still reports the existing large JavaScript bundle warning (about 2.90 MB minified). No content warnings were rewritten or publication approvals changed.

Browser interaction/visual checks are unavailable: the browser skill's runtime returned no connected browsers. Frontend tracking is exercised with injected browser storage/clock/network implementations and repeated-callback simulations; dashboard/route/consent checks use React server rendering through Vite. These are not browser interaction or visual evidence. All database tests used disposable loopback storage, synthetic users and disabled mail delivery; deployment initialization, role grants and real traffic collection were not performed.
