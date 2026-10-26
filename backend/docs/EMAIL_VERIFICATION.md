# Email verification and account lifecycle

Task 5 adds email ownership verification to the existing CommonJS controller/service/model architecture. The User schema, manuscript corpus, ingestion code, edition snapshots and publication state are unchanged. No dependency or secret was added, no real mail was sent, and no production database operation was performed.

## HTTP and frontend contracts

| Endpoint | Exact JSON input | Result |
| --- | --- | --- |
| POST /api/auth/verify-email | token | 200 with a safe message after atomic verification; 400 for malformed/unknown/expired/used/invalidated links; 503 when required storage is unavailable |
| POST /api/auth/resend-verification | email | 202 with the same message for active unverified, already verified, inactive and nonexistent accounts |

Both retain the existing success/data or success/message envelope, no-store responses, exact allowed Origin, X-CSRF-Protection: 1, application/json, safe errors and unknown-field rejection. No user ID, account-status flag or redirect can be submitted. Resend normalizes and validates email using the same rules as registration/recovery. The generic message is: "If an eligible account exists, we will attempt to send email verification instructions."

Registration still returns 201 with an unverified safe profile and does not log the account in. It now attempts verification issuance through the same service as resend. Configuration, database or provider failures do not incorrectly mark the email verified, delete the new account, or return a false delivery confirmation. An eligible user can retry through resend after configuration is fixed. Existing registration duplicate-email 409 behavior remains; resend's account-neutral contract does not remove that preexisting registration enumeration behavior.

Frontend routes are /verification-pending and /verify-email. The pending page offers an email form, a generic response, login and reading navigation. The login page links to it, and an authenticated unverified user sees a notice on the existing account/password screen. A verification link opens the confirmation page and requires an explicit button click before consuming the credential, reducing accidental consumption by link previews. Success, errors, invalid/expired-link guidance and replacement navigation use existing form/status components and styles. The frontend API service sends only allowlisted payload fields; verification does not sign out a current session.

Links use /verify-email#token=... on the trusted frontend origin. The shared fragment helper reads the token only into component memory, removes the fragment and any token query parameter from the current history entry, and never stores the credential in localStorage/sessionStorage, an input, rendered markup, logs or analytics. Page reload after scrubbing requires reopening the original email link. A newly navigated link mounts a fresh form. Any future analytics/error recording must continue excluding credential pages and request bodies.

## Credential storage, expiry and concurrency

EmailVerificationToken has its own collection and stores user, tokenHash, expiresAt, usedAt, timestamps, invalidatedAt and deliveryStatus. Only a SHA-256 hash of 32 cryptographically random bytes is persisted. Hashing uses the email-verification purpose; refresh and password-reset credentials cannot verify an email, and a verification token cannot reset a password. Unknown credential fields are rejected, and tokenHash is hidden from ordinary selection and JSON/object serialization.

Expiry defaults to 1440 minutes (24 hours), configurable from 5 to 1440 minutes. Named unique token-hash and TTL indexes plus a user/state index are declared. Every verification explicitly checks expiry, acceptance, unused and noninvalidated status, including a conditional update inside the transaction. TTL deletion is cleanup only. Replacement issuance invalidates all previous outstanding verification tokens, even if delivery of the replacement later fails; use the newest accepted email link.

Account writes serialize issuance/verification with password changes, login and administrative lifecycle changes. Verification atomically sets emailVerified, consumes exactly one eligible token and invalidates siblings. The active/unverified account condition prevents different competing tokens from both succeeding. Any error rolls back account and token writes together. Verification grants no role, session, password change or activity change. Existing authenticated sessions read the current ownership flag rather than trusting stale JWT ownership claims.

The Task 4 schema fields, index names, password policy, reset responses and token hashes are preserved. Shared schema, trusted-origin validation, input validation, storage readiness, issuance, bounded email queue and token-state helpers serve both credential purposes; there is one provider adapter, not a second delivery system.

## Account lifecycle rules

| State or event | Behavior |
| --- | --- |
| New registration | Active, user role, emailVerified false; attempt verification; no automatic login |
| Active and unverified | Login, public reading, profile lookup and password management remain available; ownership-required features must reject access |
| Active and verified | Existing account operations remain available; ownership-required features may proceed after normal authentication/authorization |
| Inactive | Login/session creation and protected requests fail; resend/forgot remain generic and issue no usable credential; verification/reset cannot reactivate the account |
| Password reset/change | Preserve emailVerified; revoke all refresh sessions and existing access, invalidate reset credentials; independent verification credentials remain eligible until their own expiry/invalidation |
| Email verification | Set only ownership plus internal version/timestamps; no login, password change, activation or session revocation |
| Deactivation/reactivation | Authorized internal administrative process only; revoke all sessions and invalidate both recovery credential purposes atomically; never revive old sessions/links |

requireVerifiedEmail is an explicit middleware guard composed after authReady/authenticate for a feature whose product rules require verified ownership. No current manuscript or account/password operation is newly made ownership-restricted, and no artificial product feature was added. Tests mount a test-only protected operation to prove this guard rejects unverified users and accepts verified users. Role authorization remains separate. Public manuscript reading stays public for anonymous, unverified and inactive visitors.

The server-only accountLifecycle.service.setAccountActive(userId, isActive) is the administrative mutation boundary. It is not imported by any public controller or exposed through a route/CLI. A future administrative integration must authorize its operator before invoking it. Both transitions validate input, lock the user, revoke every RefreshSession and invalidate all outstanding reset/verification links in one transaction. Reactivation preserves emailVerified and the password but requires a fresh login and, if still unverified, a fresh verification request. Direct database edits bypass these service guarantees and are not the supported administrative process.

authenticate already reloads isActive, passwordChangedAt and the exact nonrevoked/unexpired session on every protected request. Previously issued JWTs cannot bypass deactivation. Replica-set session creation also rechecks current activity and the originally verified password hash, so a delayed login cannot issue a session for an inactive account. No refresh endpoint or automatic session renewal existed in Tasks 1–4, and none is added here: refresh rotation/reuse detection remains a separate prerequisite for renewal. The stored sessions are revoked, but there is no claim that an unimplemented refresh flow was exercised. Access expiry/page reload still requires login.

There is no email-address-change endpoint. A future authorized email-change flow must atomically clear ownership and invalidate existing verification links before changing the mailbox; this task does not add that feature.

## Email configuration and deployment

Reuse the existing Resend adapter and explicit delivery switch. Email templates remain separate from provider/controller code. The fixed provider endpoint and acceptance semantics follow the [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email). Provider acceptance is not proof of inbox delivery. Logs contain only an event name and accepted/failed/disabled/unavailable/queue_full status, with no recipient, raw token, provider body, credentials or private error.

| Variable | Requirement |
| --- | --- |
| EMAIL_VERIFICATION_FRONTEND_URL | New required trusted frontend origin only, including scheme/port; must exactly match an AUTH_ALLOWED_ORIGINS entry. No path, query, fragment or caller redirect. |
| EMAIL_VERIFICATION_TTL_MINUTES | New optional integer, 5–1440; default 1440. |
| MAIL_PROVIDER | Existing provider selector: resend. |
| MAIL_DELIVERY_ENABLED | Existing explicit true opt-in; otherwise no mail is sent. |
| MAIL_FROM | Existing provider-verified sender. |
| RESEND_API_KEY | Existing server-side sending credential; never a VITE variable or chat value. |

Retain existing authentication, recovery, HTTPS, origin/CSRF and proxy settings. Configure the new trusted verification origin, verified sender/domain and sending-scoped credential through deployment environment management. Deploy SPA rewrites for direct /verify-email and /verification-pending visits. Disable provider link/open tracking for credential mail and exclude auth URLs/request bodies from deployment logs and analytics. No environment file was edited.

Run from backend against the intended database after reviewing the explicit command:

```powershell
npm.cmd run auth:init
```

Initialization now creates emailverificationtokens with its declared indexes as well as users, refreshsessions and passwordresettokens. Re-run it for earlier deployments. No accounts are seeded, no indexes dropped/synchronized and no manuscript collections touched. Existing conflicting indexes require an explicit migration review. This command was not run against Atlas. Verification and lifecycle mutations require replica-set/mongos transactions; unsupported standalone storage fails closed. Core login/reading still work without verification storage/configuration. Transactions reuse primary/snapshot/majority settings and sequential session-aware operations, following [Mongoose transaction guidance](https://mongoosejs.com/docs/transactions.html).

Resend limits are 5/IP/15 minutes and 3/normalized-email/15 minutes, including nonexistent accounts; bucket keys hash normalized addresses. Verification is limited to 10/IP/15 minutes. Registration retains its 20/IP/15 minute limit. Counters are bounded but per-process and reset at restart: a multi-instance deployment needs a shared/edge limiter. Generic messages and background mail avoid direct enumeration/provider latency disclosure; database paths are not claimed constant-time.

The shared bounded queue holds at most 100 pending email jobs across reset and verification. Raw links exist only in memory, and pending/failed/disabled credentials cannot be consumed. Disabled/default/test delivery cannot send real mail; tests inject doubles/fake transports. The queue is best effort: crashes can lose pending mail and provider acceptance followed by storage failure can leave an unusable link. No durable delivery or automatic retry guarantee is claimed; users request a replacement. Live provider delivery and deployment browser/cookie behavior require separate verification.

## Validation and file inventory

Executed checks: the complete backend suite passed all 125 tests (including 22 new verification/lifecycle tests); the complete frontend suite passed all 22 tests (including 3 new verification tests). Frontend lint and production build passed. The build's PDF/source guard passed all 32 checks, confirmed all 10 data files unchanged and reported databaseModified false. The existing large-bundle warning remains. No live provider delivery, Atlas initialization or browser interaction was performed.

New backend tests use a disposable one-node replica set with TTL cleanup disabled and a separate standalone database. They exercise real unique indexes, registration delivery, purpose isolation, successful/expired/unknown/used/pending links, same/different-token races, replacement races, rollback, neutral responses, configured links/expiry, provider failure, malformed input, CSRF, IP/email limits, ownership guards, deactivation/reactivation, all-session/access revocation and sanitized logs. No existing test was weakened or removed. Frontend tests cover allowlisted API calls, session preservation, fragment parsing/scrubbing, pending/landing routes and conditional ownership notices through server rendering. Browser interaction and live delivery are not certified by these tests.

Created (17):

- backend/src/models/accountTokenSchema.js
- backend/src/models/EmailVerificationToken.js
- backend/src/config/accountLinks.js
- backend/src/config/emailVerification.js
- backend/src/utils/accountInput.js
- backend/src/services/accountStorage.js
- backend/src/services/accountToken.service.js
- backend/src/services/emailVerification.service.js
- backend/src/services/accountLifecycle.service.js
- backend/src/controllers/emailVerification.controller.js
- backend/src/emails/emailVerification.js
- backend/tests/email-verification.test.js
- backend/docs/EMAIL_VERIFICATION.md
- frontend/src/features/auth/VerificationNotice.jsx
- frontend/src/pages/Auth/VerificationPending.jsx
- frontend/src/pages/Auth/VerifyEmail.jsx
- frontend/tests/email-verification.test.mjs

Modified (18):

- backend/src/models/PasswordResetToken.js: reuse the unchanged credential schema/index definitions.
- backend/src/config/passwordRecovery.js: share trusted-origin and bounded-expiry validation.
- backend/src/services/passwordRecoveryStorage.js: reuse storage/transaction readiness.
- backend/src/services/auth.service.js: shared input validation and registration delivery attempt.
- backend/src/services/email.service.js: add a verification template to the existing adapter.
- backend/src/services/passwordRecovery.service.js: share issuance, delivery queue and token-state helpers.
- backend/src/services/authStorage.js: initialize verification storage explicitly.
- backend/scripts/initialize-auth-storage.js: include verification in its completion message.
- backend/src/services/session.service.js: import shared transaction support.
- backend/src/routes/auth.routes.js: mount verification/resend with existing security and rate limits.
- backend/src/middleware/auth.middleware.js: add the composable ownership guard.
- backend/docs/AUTHENTICATION.md: update current registration, verification and initialization behavior.
- backend/docs/PASSWORD_RECOVERY.md: document shared infrastructure and lifecycle interactions.
- frontend/src/services/auth.service.js: add verification and resend methods.
- frontend/src/features/auth/resetLink.js: share fragment parsing/scrubbing while preserving recovery exports.
- frontend/src/pages/Auth/ChangePassword.jsx: show the unverified-account notice.
- frontend/src/pages/Auth/Login.jsx: add verification navigation.
- frontend/src/routes/AppRoutes.jsx: mount the two verification pages.
