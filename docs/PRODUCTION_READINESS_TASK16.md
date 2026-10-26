# Task 16: production readiness and security audit

Audit date: 2026-10-26. Recommendation: **NOT READY for production**.

The scoped hardening and local verification are complete only to the extent recorded below and in [the verification evidence](task16-verification.json). Production credentials, infrastructure, backups, email delivery and interactive browser behavior have not been validated. No public deployment, real-user change, Atlas connection, destructive migration, canonical import or publication was performed. The existing substantial Tasks 1–15 working-tree changes were preserved.

## Prioritized findings

| Severity / ID | Finding and evidence | Resolution / remaining action |
| --- | --- | --- |
| **Critical C1** | `backend/.env` was tracked and appears in Git history with an embedded MongoDB credential, without placeholder markers. Its current validity was deliberately not tested. `frontend/.env` was also tracked. | Both files were removed from the index while preserving local copies. Root ignore rules cover env files and common credentials/keys. **Treat the database credential as compromised: rotate it, disable the old credential, review access and coordinate repository-history remediation. History still contains the old file. This blocks release.** |
| **High H1** | Audit runtime is Node **22.16.0**, below the reviewed security release. The [official October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) supplies patched 22/24/26 versions. | Added `.nvmrc` 22.23.4 and production startup floors. Production startup intentionally refuses the installed runtime. **Upgrade the selected runtime and repeat validation on it. No system runtime was changed.** |
| **High H2 — fixed locally** | Live npm audits found one backend high advisory and six frontend package findings (three high, three moderate). Cached/offline-looking results initially returned zero and were superseded by live registry checks. | Updated body-parser 2.4.0, Vite 8.3.5, Zod 4.6.7, source-map-js 1.2.2 and selector-parser 7.1.6 through lockfiles. Added a selector-parser override to retain Tailwind 3. Final live audits: **zero findings in both projects**. No forced Tailwind major migration or broad application rewrite. |
| **High H3 — fixed locally** | Delayed profile reads could return a previous account's data after logout/new login; old profile 401s, logout and password-operation replies could clear a newer session. Two new regressions failed before the fix. | Added session-version checks to profile/login and guarded session clearing for logout/reset/change-password. New regression coverage verifies stale reads, 401s, old logins and delayed password/logout replies. Bearer credentials remain closure-only. |
| **High H4 — fixed locally; deployment unverified** | Startup connected MongoDB only for auth/database content, so analytics-only PDF deployment never connected. Startup did not fully validate enabled feature prerequisites; local `.env` could fill production credentials; missing indexes could leave partially usable features. | Added centralized startup configuration checks and read-only readiness checks. Analytics now requires a connection independently of auth. Production skips local dotenv files, rejects unsafe configuration and requires configured account mail settings. No schema/index creation occurs during startup. Actual Atlas initialization, delivery and production readiness remain operator steps. |
| **High H5 — release blocker** | There is no verified hosting/domain/proxy configuration, production sender test, backup/restore evidence, patched-runtime rehearsal or immutable release snapshot. No deployment platform configuration was found in the repository. | Added [the controlled release runbook](../backend/docs/DEPLOYMENT.md). These external checks must be completed and recorded before release. A written runbook is not proof that infrastructure or backups work. |
| **High H6 — database-publication blocker** | The frozen manuscript candidate remains `importApproved: false`, `published: false`, `CANDIDATE_REVIEW_REQUIRED`. The ordinary importer validates an empty legacy scaffold and refuses write mode. | Preserved every boundary. Database-edition deployment needs separately reviewed approval/import tooling and explicit authorization. PDF projection fidelity passes; this audit does not authorize publication of a draft or require changing repeated source passages. |
| **Medium M1** | Rate limit counters are bounded but process-local. Restarting or adding instances changes their aggregate enforcement. Correct forwarded-IP handling depends on the real ingress. | Existing auth/search/admin limits retained. Start with an explicitly reviewed single-instance/edge arrangement; establish edge/shared enforcement before scaling. Trust only the actual proxy path and block direct ingress. No new distributed service was invented. |
| **Medium M2** | Refresh session storage/cookies exist, but there is **no refresh endpoint** or silent session recovery. Access tokens are memory-only and expire after 15 minutes; reload requires sign-in. Registration has a backend endpoint but no dedicated frontend registration flow. | Reported as actual limitations. No new authentication roadmap features were added. Real cross-site cookie/logout behavior still needs browser verification. |
| **Medium M3** | Pending account-email delivery uses a bounded in-process queue, with no durable outbox/retry worker. Provider acceptance does not establish inbox delivery. | Graceful shutdown now drains queued work within a deadline. Abrupt crashes can still lose pending deliveries; resend is available and credentials fail closed until usable. Verify sender/DNS/provider behavior in staging. |
| **Medium M4** | No automatic retention is configured for private notes/history, notifications or moderation audit. Deactivation revokes credentials but retains owned records and published content. | Preserved intentional data and audit history; documented the need for explicit retention/erasure ownership and a separately reviewed cleanup policy. No user data was deleted. Session/recovery/verification and analytics expiry policies already exist. |
| **Medium M5** | Browser availability check returned no connected browser. Responsive layout, interactive keyboard/focus behavior, real cookie flows and deployed SPA rewrites were not verified. | 745 route renders and semantic/ARIA checks pass; these are server-render evidence only. Representative normal text contrast against ivory: forest 8.74:1, muted 5.47:1, bronze-ink 5.57:1. This is not a complete accessibility audit. Browser acceptance remains a release gate. |
| **Medium M6** | Frontend output contains a ~2.924 MB minified JS bundle (~583 KB gzip), full manuscript data and several large branding images. Vite emits a size warning. | Warning retained visibly. No manuscript removal, arbitrary code splitting, asset redesign or artificial warning suppression. Measure deployed mobile/network performance before release. |
| **Medium M7** | Repository still tracks **3,656 backend node_modules files**. Earlier feature work is largely uncommitted/untracked. A deployment from current Git HEAD would not represent the verified workspace. | Root ignores prevent new dependency tracking. Existing tracked dependency cleanup and selection of a reviewed release commit remain follow-up release hygiene; no bulk staging/removal or history rewrite was performed. Install via lockfiles in a clean release workspace. |
| **Medium M8** | Static-host CSP/security headers, log aggregation/alerting, backup retention and exact cookie/domain policy are external and unverified. Backend Helmet does not protect a separately hosted frontend. | Runbook documents explicit host responsibilities and actual Google Fonts/API/image allowances. No fictional infrastructure or untested blanket CSP was installed. |
| **Low L1** | Registration returns a duplicate-email conflict, which permits account-existence discovery; recovery/resend remain generic. Some packages have newer versions without current advisories. | Existing API contract retained. Decide whether to change registration disclosure separately; evaluate unrelated upgrades through normal compatibility review. |
| **Low L2 — fixed locally** | Desktop sign-in was inert and mobile sign-in disabled despite an existing `/login` route. Route smoke checks still expected two obsolete pre-Task-10 search messages. | Connected both sign-in buttons to the existing route. Updated exact search-state assertions and added assertions for all five search fields; retained the full route/import/ARIA matrix. |
| **Low L3** | Mongoose emits existing deprecation warnings for the `new` query option in some tested update paths. | Tests pass; migration to `returnDocument` is deferred to a focused compatibility change. Warnings were not suppressed. |

The dependency fix also addresses the [maintainer's compressed-body denial-of-service advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828). All JSON parsers now reject compressed request bodies, with auth/admin limited to 8 KB, analytics to 2 KB and the existing general 1 MB limit retained. Invalid JSON, oversize and compressed requests produce safe 400/413/415 responses while health remains available.

## What actually exists

| Area | Implemented and inspected | Limits / dependencies |
| --- | --- | --- |
| Account identity/auth | Required normalized email with case-insensitive unique index; bcrypt hashes excluded from selection/serialization; register/login/logout/me; hashed revocable sessions; single-use hashed reset/verification tokens; password change; active-account checks. | User role is restricted to `user`; privileges are separate operator grants. Production requires HTTPS origins, external credentials, initialized replica-set storage and configured account mail. No refresh endpoint, MFA or real account seeding. |
| Authorization and private data | Live user/session/grant checks, owner-scoped reads/mutations, immutable ownership, exact mutation allowlists, CSRF marker and Origin enforcement. Separate bookmarks/private notes, transactional reading progress/history and replay protection. | User deactivation retains data. No automatic private-history expiry. No private note becomes canonical content. |
| Reader/content/search | PDF-backed shared projection, books/chapters/verse addresses, supporting notes/materials and bounded typed/paginated search. Database source rechecks edition approval; search snapshots are bounded/cached. | No approved database edition. No Atlas query-plan/load benchmark. Existing search bounds/cache/rate limits are preserved; an exceeded snapshot bound fails rather than silently truncating. |
| Community | Discussions/comments, reading circles/membership, private-circle permissions, reports, hide/restore/lock/unlock/delete and append-only moderation audit with transactional notifications. | Discussions/comments publish immediately; no prepublication queue. Posting flag and separate global moderator grants apply. Private-circle restrictions still apply to moderators. |
| Articles | Owned drafts/revisions, submission, independent moderator review, approved immutable snapshots, public published views, safe plain-text rendering and allowlisted HTTPS raster covers. | No file upload service; no server-side remote-image fetch. No article comments/search addition or canonical manuscript publishing through this feature. |
| Notifications | Owner-scoped in-app activity, replay-safe event keys and read state, private-target access rechecks/redaction. | In-app only; no activity-email delivery/preferences or durable outbox. |
| Analytics | Explicit consent, DNT/GPC override, hashed random identifiers, public-path allowlists, expiry/deduplication and aggregate owner/admin reports. | No raw IP/user-ID/private-note analytics; browser counts are estimates. Frontend/server flags, origins, indexes and explicit grants are all required. |
| Administration | Explicit administration grant on existing Admin access; protected overview/user search/status/audit; self-status and last-admin protection; atomic revocation/audit; existing article/community moderation UIs. | Analytics Owner/Admin, platform administration and community moderator permissions remain distinct. No web role self-promotion or fictional mail/worker health. |

Existing validations build bounded/literal queries rather than copying client MongoDB operators into filters. Ownership is enforced server-side. React text rendering escapes user-generated content; no upload/HTML-rendering feature was added. Existing unique indexes, revision/CAS checks, replay keys, transactions and tests cover duplicate/concurrent operations. This is source review plus local regression evidence, not penetration testing or certification of the deployed system.

## Hardening delivered

- Production runtime/flag/port/proxy/database/secret/origin/link/mail checks; loopback binding by default; analytics-only database connection; no development `.env` fallback in production.
- Explicit existing-index readiness, generic no-store `/api/ready` (200/503), existing `/api/health` liveness preserved, and no automatic index migrations or imports.
- Bounded connection/pool/socket/wait settings, disabled Mongoose command buffering/automatic collection/index creation, and database lifecycle events without host/URI disclosure.
- Bounded HTTP request/header timeouts, SIGTERM/SIGINT request/email drain and database disconnect, with a 15-second shutdown budget. Startup failures expose only a fixed safe event/code.
- Dependency fixes and compressed-body rejection, targeted body limits, safe error responses and regression tests.
- Frontend session isolation, validated public build configuration/API URLs, 15-second API response/body deadline and working sign-in navigation. Caller-owned AbortSignals remain unchanged; their owner controls underlying transport cancellation after a response deadline. Mutations are not automatically retried.
- Safe env examples, root ignore rules, local-only env index removal, release findings, reproducible command/evidence record and deployment/backup/rollback instructions.

## Canonical manuscript verification

The master PDF SHA-256 remains `bbdd152c8b870862b44214dbd56059fa2a85146e6f1ad1e4d48f1d5c7fa34c76`. The checked projection contains 10 books, 230 chapters, 3,905 reference slots, 3,874 authored verses, 31 unresolved references, 1,470 notes, 72 note cross-references, 72 index entries and 38 glossary entries.

Fidelity passed all **32 checks**, including master-PDF verse/note comparisons ignoring layout whitespace, front/back matter, complete artifact/provenance and structural reconciliation. Ten protected data files were unchanged. Ingestion reports 206 source issues, zero ingestion errors, three invalid cross-reference targets and 67 repeated-passage groups. Editorial records already mark 206 decisions accepted; that is **not** import/publication approval. Repeated passages and invalid citations were preserved for consistent reference to the physical PDF.

Frozen `human-testament-0.1.0-rc.1` verified 12 artifacts against the independently recorded manifest hash `b8207096f76054487efa620b308b4a37ef799597c6a89b90aeb3b97f5ec9d308`. Its import flag remains false. The legacy `import:check` reports zero books/chapters/verses because it reads the empty scaffold; its successful dry run must not be represented as a full-manuscript import validation. Write mode remains disabled. User content and analytics collections remain separate from manuscript records.

## Commands and results

| Command / check | Result |
| --- | --- |
| Baseline backend `npm.cmd test -- --test-concurrency=1` | 270 passed, zero failed. |
| Baseline frontend `npm.cmd test` | 77 passed, zero failed. |
| Pre-fix frontend security regression | Two tests failed as expected, reproducing stale profile disclosure and late logout session clearing. |
| New backend security tests | Runtime/configuration, malformed/oversize/compressed bodies, readiness failure/recovery/deadline, real private server startup/probes/shutdown and production dotenv exclusion; final totals recorded in the evidence file. |
| Final backend `npm.cmd test -- --test-concurrency=1` | **275 passed, zero failed**. Earlier post-fix run passed 273 before the lifecycle/env-file tests were added. |
| Final frontend `npm.cmd test -- --test-concurrency=1` | **82 passed, zero failed**. Existing tests were retained. |
| Frontend `npm.cmd run lint` | Passed. Backend has no lint script; its full test suite is the configured automated check. |
| Frontend `npm.cmd run build` | Passed, Vite 8.3.5, 302 modules. Bundle-size/plugin-timing warnings remain visible. Prebuild runs the PDF content/fidelity check. |
| Frontend `npm.cmd run check:home` | Passed landmarks/headings/anchors/ARIA, collection and fallback checks. |
| Frontend `npm.cmd run check:content` | Passed **745 route renders**, **502 relative imports**, nine loopback direct URL requests and three module transforms. |
| Backend `npm.cmd run fidelity:check` | Passed all 32 checks; 10 protected data files unchanged; no DB writes. |
| Backend `npm.cmd run content:check` (through frontend prebuild) | Passed; `manuscriptMatchesPdf: true`; no DB writes. |
| Backend `npm.cmd run ingestion:check` | Passed reconciliation; 206 visible source issues, zero ingestion errors; no DB writes. |
| Backend `npm.cmd run editorial:check` | Passed; existing 206 accepted decisions retained; import approval false. |
| Backend `npm.cmd run import:check` | Passed legacy empty-scaffold dry run only; no connection/writes. |
| Backend candidate check with version/hash shown above | Passed; 12 artifacts; approval false. |
| Both `npm.cmd audit --json --offline=false --prefer-online` | Final zero vulnerabilities; exact initial/final counts in evidence. `npm outdated` was also inspected; unrelated major upgrades deferred. |
| Dependency tree / stylesheet | Patched dependency versions resolved successfully. CSS remains exactly 26,887 bytes, SHA-256 `1ca8f85c135b0bf6c1583e1b69186c81933f7ba80b12937b280898d5ace679a0`, matching the pre-update stylesheet. |
| Built artifact secret scan | No exact sensitive backend env value found in emitted JS/CSS/HTML. Values were never printed. This narrow scan is not a complete history/secret audit. |
| Git env/index/ignore checks | Both local env files preserved; neither remains in the index. Env variants ignored; examples permitted. History not erased. |
| Browser discovery | No available browser. No responsive/visual/interactive-keyboard verification claimed. |

An intermediate frontend run failed nine strict AbortSignal identity checks after the initial timeout implementation; transport was corrected to preserve the original contract without weakening those tests. That run also had one `UNKNOWN` filesystem read failure in a parallel Vite fixture; it did not recur in the passing serial suite. The first content-route run failed on obsolete search copy; exact current-state assertions plus all five filter checks now pass. Initial sandbox `spawn EPERM` and restricted-network/cache results were rerun using authorized execution/live-registry access, not counted as successful checks.

No live `api:check` against Atlas was run: its existing script loads deployment credentials/connects to a database. Local API suites and the private real-server smoke test supplied isolated API evidence instead. No clean `npm ci` release install, load test, external mail, real TLS/cookie/domain test, Atlas backup or restore rehearsal was completed. Repeat release checks after upgrading Node.

## Task 16 file inventory

Created:

- `.gitignore`, `.nvmrc`, `backend/.env.example`.
- `backend/src/config/runtime.js`, `backend/src/services/runtimeReadiness.js`, `backend/tests/production-security.test.js`.
- `frontend/config/production-env.mjs`, `frontend/tests/production-security.test.mjs`.
- `backend/docs/DEPLOYMENT.md`, `docs/PRODUCTION_READINESS_TASK16.md`, `docs/task16-verification.json`.

Modified:

- `backend/package-lock.json`.
- `backend/src/app.js`, `backend/src/server.js`, `backend/src/config/auth.js`, `backend/src/config/db.js`, `backend/src/middleware/error.middleware.js`.
- `frontend/.env.example`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.js`.
- `frontend/src/services/auth.service.js`, `frontend/src/services/api/client.js`, `frontend/src/components/layout/Navbar.jsx`, `frontend/scripts/check-content-ui.mjs`.

Git-index changes only: `backend/.env`, `frontend/.env` are staged for removal from tracking; their local files remain. No commit or history rewrite was made. Ordinary install/build outputs in `frontend/node_modules` and `frontend/dist` were regenerated and remain ignored.

Because backend dependencies were already tracked, targeted npm updates also changed these generated files: `backend/node_modules/.package-lock.json`; `body-parser/README.md`, `body-parser/lib/read.js`, `body-parser/lib/types/json.js`, `body-parser/lib/types/urlencoded.js`, `body-parser/lib/utils.js`, `body-parser/package.json`; `qs/.github/THREAT_MODEL.md`, `qs/CHANGELOG.md`, `qs/README.md`, `qs/dist/qs.js`, `qs/lib/parse.js`, `qs/lib/stringify.js`, `qs/lib/utils.js`, `qs/package.json`, `qs/test/parse.js`, `qs/test/stringify.js`, `qs/test/utils.js` (paths after the first are relative to `backend/node_modules`). Install changes are represented by the lockfile; no manual dependency-source patch was applied.

## Release decision and manual sign-off

**NOT READY.** Before a controlled release: rotate the exposed credential and review access; build a reviewed immutable release snapshot on patched Node; perform a clean install and repeat tests; initialize/verify the intended Atlas indexes and transactions; confirm actual HTTPS domains, CORS, cookies, proxy/rate controls and sender delivery; demonstrate backup restoration and compatible rollback; complete browser/accessibility/mobile checks; configure monitoring and decide remaining operational limitations. Database manuscript publication remains a separate explicit approval/import task. The complete operator sequence is in [the runbook](../backend/docs/DEPLOYMENT.md).
