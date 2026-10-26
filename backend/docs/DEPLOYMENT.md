# Controlled release runbook

Status on 2026-10-26: **not approved for production**. See [the Task 16 findings](../../docs/PRODUCTION_READINESS_TASK16.md). These are operator instructions; no deployment, Atlas initialization, restoration, permission grant, or manuscript import was performed during the audit.

## Release prerequisites

1. Rotate the database credential previously committed in `backend/.env`; disable the old credential and review database/repository access. Removing a file from the Git index does not remove its history. Coordinate any history rewrite separately. Never paste the credential into a ticket, shell command, screenshot, or report.
2. Use a reviewed, committed/tagged source snapshot containing the existing Tasks 1–15 and these fixes. The current working tree has substantial earlier work; deploying the old Git HEAD will omit it. Do not stage everything blindly. The repository still tracks installed backend dependencies; plan their removal from tracking separately and install from lockfiles in the release workspace.
3. Install a patched Node runtime. `.nvmrc` pins 22.23.4. The production validator accepts reviewed floors 22.23.4, 24.22.1 and 26.12.1 in their respective major lines; reassess these floors against current advisories before each release. The audit machine ran 22.16.0, so all checks must be repeated on the selected patched runtime. See the [Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
4. Select the actual hosting platform, domains, proxy topology, Atlas cluster and backup policy. None is defined by a deployment configuration in this repository. No domain or infrastructure credentials are supplied by this runbook.
5. Record a backup identifier and a successful isolated restore exercise, accepted recovery point/time objectives, monitoring ownership and the previous release artifact. A written procedure alone is not recovery evidence.

## Environment

Backend variable names and safe defaults are in [`.env.example`](../.env.example). Supply production values through the hosting environment/secret store. Set `NODE_ENV=production` externally. Production startup skips local `.env` loading; a local file cannot promote development startup to production. Development/test startup can still load local `.env`.

| Configuration | Required behavior |
| --- | --- |
| `NODE_ENV`, `HOST`, `PORT` | Production mode; default bind is `127.0.0.1:5000`. Set `HOST=0.0.0.0` only where the platform requires a container interface behind its controlled TLS ingress. Port must be 1–65535. |
| `CONTENT_SOURCE` | `pdf` preserves the checked-in PDF projection. `database` additionally requires an independently approved published edition and a database connection. An empty database is not a published edition. |
| `MONGODB_URI` | Required for auth, analytics or database content. Use a newly rotated, least-privilege application identity, TLS and restricted network access. Keep this value server-only. Transactional account/community features require a replica set or Atlas equivalent. |
| `AUTH_ENABLED` | Explicit `true` to release account functionality; otherwise it fails closed. |
| `AUTH_ACCESS_TOKEN_SECRET` | Unique cryptographically random secret, at least 32 UTF-8 bytes, without whitespace or example/development markers. Generate/store out of band. Heuristics cannot establish a secret's provenance; never reuse development credentials. Rotation invalidates bearer tokens; handle session revocation through an authorized operator process. |
| `AUTH_ALLOWED_ORIGINS` | Comma-separated exact HTTPS frontend origins, without paths or trailing slash. No wildcard for account requests. |
| `AUTH_ALLOW_INSECURE_LOCALHOST` | `false` in production. |
| `AUTH_COOKIE_SAME_SITE` | `lax` or `strict` for an appropriate same-site deployment; `none` only when cross-site cookies are necessary. Cookies remain Secure/HttpOnly and scoped to `/api/auth`. Test the actual browsers/domain arrangement, including third-party-cookie restrictions and logout revocation. |
| `AUTH_TRUST_PROXY_HOPS` | Numeric 0–10, matching the controlled ingress path. Default 0. Prevent direct access that could spoof forwarded IPs. Rate limits are per process; configure edge/shared enforcement before horizontal scaling. |
| `MAIL_DELIVERY_ENABLED`, `MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY` | A production account release requires delivery enabled, provider `resend`, a verified sender, and the provider secret. Provider acceptance is not inbox delivery. Use separate deployment credentials; verify sender DNS and real delivery in staging. There is no SMTP configuration or durable email worker in this application. |
| `PASSWORD_RESET_FRONTEND_URL`, `EMAIL_VERIFICATION_FRONTEND_URL` | Frontend origin only, included in the auth allowlist. The server supplies the existing reset/verification route paths. |
| `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_MINUTES` | Integers: reset 5–60 (default 30), verification 5–1440 (default 1440). |
| `COMMUNITY_POSTING_ENABLED` | Explicit posting/review gate. Enabling it requires auth and initialized community/article storage. Global moderation is a separate operator grant. |
| `ARTICLE_COVER_IMAGE_ORIGINS` | Explicit permitted HTTPS image origins for the existing raster-cover policy. No upload service or server-side remote-image fetch is implemented. |
| `ADMINISTRATION_ENABLED` | Explicit flag, initialized admin storage, and an independently granted administration permission. A User role or an analytics Owner grant does not enable administration. |
| `ANALYTICS_ENABLED`, `ANALYTICS_ALLOWED_ORIGINS`, `ANALYTICS_RETENTION_DAYS` | Opt in explicitly; exact HTTPS origins; retention 7–365 days (default 180). Analytics requires MongoDB even when auth is disabled. Client consent/DNT/GPC remain independent requirements. |

Frontend build variables are public and documented in [its example](../../frontend/.env.example): `VITE_CONTENT_SOURCE=pdf` or `api`, HTTPS `VITE_API_URL` without credentials, query, fragment or a trailing `/api`, and `VITE_ANALYTICS_ENABLED=false` unless approved/configured. A blank API URL permits a PDF-only reader; account/community functions will show configuration errors. API content or enabled analytics requires the API URL. Unknown `VITE_` variables are rejected by production builds. Never place backend secrets in any `VITE_` variable, source file, or static hosting setting that is bundled into JavaScript.

## Build and verification

Run commands from their indicated directories on the patched runtime, in a clean release workspace. `npm ci` is the release installation step; the audit used targeted `npm update` plus tests, not a clean-install rehearsal.

```powershell
# backend
npm.cmd ci
npm.cmd test -- --test-concurrency=1
npm.cmd audit --json --offline=false --prefer-online
npm.cmd run fidelity:check
npm.cmd run content:check
npm.cmd run ingestion:check
npm.cmd run editorial:check
npm.cmd run import:check
npm.cmd run candidate:check -- --version 0.1.0-rc.1 --manifest-sha256 b8207096f76054487efa620b308b4a37ef799597c6a89b90aeb3b97f5ec9d308
```

`import:check` validates the legacy **empty scaffold**, not the complete candidate; it is not evidence of an importable manuscript. Fidelity/ingestion/candidate checks verify the full projection separately. Never invoke an importer with write intent during release preparation. The current write path refuses before connecting to MongoDB; publication requires separately reviewed tooling and explicit approval.

```powershell
# frontend, after setting only the public build configuration
npm.cmd ci
npm.cmd test -- --test-concurrency=1
npm.cmd run lint
npm.cmd audit --json --offline=false --prefer-online
npm.cmd run build
npm.cmd run check:home
npm.cmd run check:content
```

Run the heavy backend Mongo fixtures and frontend Vite checks separately. Preserve the production artifact, lockfiles, test outputs, source/candidate hashes and configuration names with the release record. Inspect built assets for credential exposure without printing secrets. A registry audit is a dated advisory check, not proof that the application has no vulnerabilities.

## Explicit database setup

After independently verifying the target database identity, backup and operator authorization, initialize the required existing collections/indexes from `backend`:

```powershell
npm.cmd run auth:init
npm.cmd run notifications:init
# For the complete community and publishing feature set:
npm.cmd run community:init
npm.cmd run articles:init
# Only when each optional feature is being enabled:
npm.cmd run analytics:init
npm.cmd run admin:init
```

These scripts create declared indexes/coordination metadata and seed no real accounts. `auth:init` includes session/recovery/verification, bookmarks, private notes and reading storage. Startup now disables implicit model collection/index creation; missing required storage fails readiness rather than silently accepting reduced guarantees. Startup checks auth/personal/reading/recovery/verification/notification prerequisites; community/article prerequisites when posting is enabled; optional analytics/admin prerequisites when enabled. Public community/article reads still need their own initialized storage even if posting is disabled.

There is **no new schema or index migration in Task 16**. Existing prerequisites include case-insensitive unique email, unique credential hashes with TTLs, unique owner/verse bookmarks, reading replay/concurrency indexes, notification replay indexes, article/community ownership/status indexes, analytics deduplication/expiry and the administration chronology index. Conflicting/duplicate existing data requires a reviewed migration. Do not call `syncIndexes()`, drop indexes, delete duplicates or alter manuscript records automatically.

Provision privileges only through existing operator procedures: [administration](ADMINISTRATION.md), [analytics](ANALYTICS.md), and the community moderator documentation/scripts. User account input cannot choose an administrative role. Initialization and permission provisioning are separate operations.

## Hosting and controlled rollout

1. Deploy the backend artifact using `npm.cmd start` (or `npm start` on the platform), with external production variables and TLS ingress. Grant access only to required files; do not copy local `.env`, `.git`, audit logs or development secrets. Treat the backend source PDF/artifacts as private deployment inputs rather than serving the backend directory statically.
2. Serve `frontend/dist` on the actual static platform. Configure BrowserRouter fallback to `index.html` for application navigations. API requests must reach the backend and missing assets must retain 404s. Cache fingerprinted assets immutably; make HTML revalidate so rollbacks do not mix versions. [Vite preview is a local preview server](https://vite.dev/guide/static-deploy), not the production host.
3. Apply static-host TLS/security headers separately: backend Helmet does not protect the frontend host. Test CSP against the existing Google Fonts stylesheet/font origins, configured image origins and API connections; deploy a reviewed policy before enforcement. Restrict framing, MIME sniffing and referrer disclosure. Do not assume an untested generic CSP is safe.
4. Verify `/api/health` returns 200 for liveness and `/api/ready` returns 200 before admitting traffic. Readiness failures return only a generic 503; no URI, index name, user data or stack trace. Checks are coalesced/cached for two seconds and the HTTP probe has a five-second deadline; driver work has its own bounds. External email delivery and deployment health are not established by readiness.
5. Exercise real HTTPS browser flows on mobile/tablet/desktop: direct reader/search/materials links, loading/error/empty states, keyboard and focus, sign-in, expiry, recovery/verification links, cookie creation and logout revocation. Access tokens are memory-only with a 15-minute lifetime; page reload requires sign-in. No refresh endpoint exists. Verify private resources cannot be opened as another account and permission revocation takes effect immediately.
6. Test community/private-circle moderation, article peer review, admin deactivation and optional aggregate analytics with synthetic staging users. Disable real delivery/tracking in restore exercises. Choose explicit analytics consent/configuration; inspect no private URL or note reaches logs/events.
7. Monitor bounded startup/shutdown/database events, generic 5xx counts, readiness transitions, provider outcomes and latency through the chosen platform. Do not log bodies, Authorization/Cookie headers, reset/verification URLs, private notes or unnecessary identifiers. Platform log retention, alerting and access control must be configured externally.

Requests reject compressed JSON (415); auth/admin JSON is limited to 8 KB, analytics to 2 KB, other JSON to 1 MB. Frontend API calls have a 15-second response/body deadline. Caller-owned AbortSignals remain unchanged; callers retain responsibility for aborting their underlying request after a timeout. Requests without such a signal are aborted by the client on timeout. Mutations have no automatic retry because the outcome may be unknown; re-read state before repeating a write.

The backend stops accepting traffic and drains active requests/email work on SIGTERM/SIGINT, disconnecting Mongoose within a 15-second shutdown budget. The platform must provide that termination grace period and restart failed processes. Email work remains process-local; an abrupt crash can lose a pending delivery and the reader must resend.

## Backup, restore, and rollback

No Atlas backup configuration or successful restore was available to verify. In Atlas, identify the actual cluster tier and supported backup options, set an approved schedule/retention, restrict backup operators, verify encryption/access and record a completed snapshot before release. See [Atlas backup guidance](https://www.mongodb.com/docs/atlas/backup-restore-cluster/). Do not assume a free tier has production recovery coverage.

For a rehearsal, use the Atlas Backup UI to select a completed snapshot and restore **only to a newly provisioned, isolated target** with compatible topology/version. Keep application traffic stopped on the target. Atlas cluster restores replace target data, so verify the target identifier independently before executing; this audit authorizes no restore. See [the restore procedure](https://www.mongodb.com/docs/atlas/backup/cloud-backup/restore-from-snapshot/).

Record snapshot/restore IDs, source time, elapsed recovery time and collection/index checks. Verify owner references, expected counts, unique/TTL indexes, transaction support, audit records, analytics expiry and the immutable manuscript source/candidate hashes. Restrict access to restored private data; do not connect public clients or real outbound mail to it. A restored snapshot may contain credentials and sessions that were later revoked. Before any real recovery cutover, use a separately authorized invalidation plan for sessions/recovery tokens and secret rotation; never resurrect old authorization accidentally. No bulk credential deletion/revocation script is included here.

For application rollback, stop rollout/admission, drain the new backend, deploy the previous reviewed immutable backend/static artifacts and compatible configuration, then repeat liveness/readiness and critical read/ownership checks. Retain old fingerprinted assets during the transition. These Task 16 changes require no data rollback. Keep credential rotations and security fixes: do not roll back to the compromised credential or vulnerable runtime/packages. If the old artifact lacks the fixes, prepare a patched rollback artifact first. Do not restore a database or remove indexes merely to roll back code. Data recovery or destructive schema changes require a separate explicit decision and verified backup.

Release sign-off must separately record credential rotation, patched-runtime revalidation, production index/readiness checks, sender/domain/cookie/CORS verification, a restore rehearsal, browser/accessibility acceptance, monitoring/rollback rehearsal and any canonical publication authorization. No canonical publication authorization was granted by this task.
