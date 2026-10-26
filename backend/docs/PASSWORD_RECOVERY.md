# Password recovery and password changes

Task 4 extends the existing User/RefreshSession/JWT system with a separate PasswordResetToken model, shared password policy, transactional credential changes, explicit email delivery, and minimal frontend forms. No dependency, real account, production record, environment secret, manuscript text, ingestion artifact, edition or publication decision is changed.

Task 5 shares this token schema, storage readiness, trusted-link validation, issuance and bounded email queue with a separate verification collection/purpose. Reset/change preserve email ownership and independent verification links. Administrative deactivation/reactivation invalidates both recovery purposes and all sessions. See [EMAIL_VERIFICATION.md](EMAIL_VERIFICATION.md) for lifecycle rules and additional initialization/configuration; the Task 4 endpoint contracts and index names remain unchanged.

## Endpoints and browser flows

| Endpoint | Required JSON fields | Behavior |
| --- | --- | --- |
| POST /api/auth/forgot-password | email | 202 with the same generic message for existing, nonexistent, unverified and inactive accounts; queues email only for an eligible active account |
| POST /api/auth/reset-password | token, newPassword, passwordConfirmation | 200 on successful single-use reset; 400 for invalid/expired/used/invalidated links or bad input |
| POST /api/auth/change-password | currentPassword, newPassword, passwordConfirmation | Requires valid Bearer authentication; verifies the current password, rejects reuse and changes only the authenticated account |

All three retain exact-Origin, non-simple CSRF-header, JSON-body, no-store response and safe error conventions. Bodies reject unknown fields, including userId, redirect and privileged account fields. Malformed email/body errors are independent of account existence. The forgot-password response says only that delivery will be attempted; it never confirms that an email was delivered.

New routes use the existing content layout, typography, colors, Button and API service: `/forgot-password`, `/reset-password`, `/account/change-password`, and a minimal `/login` page with a forgotten-password link. Login leads to the account password form. The change form fetches the current profile and offers login when authentication is missing. Success and error states are accessible status/alert regions. Registration UI, general profile features and reading features remain outside this task.

The configured email link is `/reset-password#token=...`. The fragment is not sent in HTTP requests. The reset screen reads it into component memory, removes it from the current address/history entry, does not put it in an input/markup, and never writes it to localStorage/sessionStorage. Opening a new route entry mounts a fresh reset form. The page sets no-referrer metadata. A reload after URL scrubbing needs the original email link again. Exclude recovery pages and request bodies from any future analytics/error-recording integration.

The auth service sends all requests through the shared API client. It sends the in-memory Bearer access token for password changes, clears local access after successful reset/change, and asks the user to log in again. Failed validation preserves the current login; 401 clears it. The server clears its refresh cookie on successful reset/change using the established cookie attributes.

## Password and reset-token rules

Registration, reset and change share `utils/passwords.js`: at least 12 Unicode code points, at most 72 UTF-8 bytes, nonblank, no ASCII control characters, no trimming/truncation, bcryptjs cost 12. Confirmation is mandatory for reset/change and must match exactly. A password change verifies the old password and rejects the same password. Hashes, raw tokens and plaintext passwords never enter API responses or application logs.

Reset credentials use the existing cryptographic random-token helper: 32 random bytes, base64url. SHA-256 hashing is separated by the password-reset purpose, so a refresh credential is not a reset credential. PasswordResetToken stores user, tokenHash, expiresAt, usedAt, createdAt/updatedAt, invalidatedAt and deliveryStatus. It never stores the raw token. The hash is excluded from default queries and document serialization. The model rejects unknown credential fields.

Indexes include a unique token-hash index, expiresAt TTL index and user/state lookup index. Expiry defaults to 30 minutes and can be configured from 5 to 60 minutes. Both expiry and unused/non-invalidated/accepted status are checked explicitly before and during reset; security never depends on TTL deletion. New requests invalidate previous outstanding tokens for that user, including when subsequent delivery fails; the user should use the newest accepted email link.

## Atomicity and session invalidation

Password mutations require a transaction-capable MongoDB replica set or sharded cluster, as provided by the intended Atlas deployment. Transactions use primary reads, snapshot read concern and majority writes. Every database operation in a transaction receives its session and runs sequentially, following the [Mongoose transaction guidance](https://mongoosejs.com/docs/transactions.html).

Reset atomically locks the account, conditionally consumes the unused/unexpired token, updates passwordHash/passwordChangedAt, invalidates every other outstanding reset credential and revokes every refresh session for that user. Any failure aborts the complete mutation. Concurrent requests with the same token, or different valid tokens for the same account, cannot both succeed. Hashing happens before entering the transaction to avoid holding account locks during bcrypt work.

Forgot-password replacement issuance, reset, password change and replica-set login session creation serialize through the account's internal version counter (`__v`). Login rechecks the exact password hash it verified before issuing a session, preventing a delayed old-password login from creating a session after reset. Credential changes advance passwordChangedAt monotonically, even within one millisecond or with an ahead-of-clock previous date. Email, display name, role, verification and activity flags are not changed.

Authentication already reads current User state and the matching nonrevoked/unexpired RefreshSession for every protected request. Consequently every access token issued before reset/change is rejected after commit, including tokens from other devices. Other accounts' credentials and sessions are untouched. This is tested revocation with state checks, not a claim that a purely stateless JWT can be recalled.

Standalone MongoDB can still run the existing core registration/login. Password reset/change return a sanitized 503 on unsupported storage; forgot-password retains its generic response. No unsafe partial-update fallback runs. Collections/indexes are initialized before transactions; missing reset indexes fail closed. Inactive accounts are not recovered or reactivated.

## Email provider and development strategy

No existing provider/dependency was configured in the code. The small email service uses built-in fetch and a [Resend Send Email API adapter](https://resend.com/docs/api-reference/emails/send-email), with separate plain-text email content. It calls a fixed HTTPS provider endpoint, uses server-side credentials, and never accepts a destination/redirect/host URL from the request. Sender identity is configured separately. Provider bodies, keys, recipients and reset links are never logged.

Delivery is disabled unless both provider selection and explicit delivery enablement are configured. There is no console/token-preview transport. Under NODE_ENV=test, the default network transport stays disabled even if delivery variables are present; adapter tests must inject a fake transport, and endpoint tests replace the email service with an in-memory double. No real emails were sent during implementation or testing.

The public response does not wait for provider latency. A bounded in-process queue retains the raw link only in memory. Pending tokens cannot reset a password. The token becomes usable only after provider acceptance is recorded. Definite rejection, disabled delivery, exceptions or queue exhaustion mark it failed/disabled and invalidate it. Status-only audit events distinguish accepted/failed/disabled/unavailable, and accepted means provider acceptance, not inbox delivery. The queue logs no raw provider errors.

This queue is best effort: a process crash/deployment can lose pending work, and a provider acceptance followed by a database failure can leave an unusable pending token. There are no automatic retries or durable delivery guarantees. The user can request a replacement. A durable worker/outbox would require a separate design that protects rather than persists raw recovery credentials. Disable provider link/open tracking for recovery mail and verify actual provider delivery in the deployment before release; live delivery was not tested here.

## Configuration and deployment

Keep all existing Task 3 auth variables and HTTPS/origin/CSRF/proxy requirements. Additional variable names:

| Variable | Purpose |
| --- | --- |
| PASSWORD_RESET_FRONTEND_URL | Trusted frontend origin only, including scheme/port; must match an AUTH_ALLOWED_ORIGINS entry. No path, query, fragment or request Host is used. The application appends /reset-password. |
| PASSWORD_RESET_TTL_MINUTES | Optional integer from 5 to 60; default 30. |
| MAIL_PROVIDER | Select the Resend adapter explicitly. Unconfigured providers do not send mail. |
| MAIL_DELIVERY_ENABLED | Explicit delivery opt-in; keep disabled in ordinary development. |
| MAIL_FROM | Verified sender mailbox/display name for the provider. |
| RESEND_API_KEY | Server-only provider credential; never a VITE variable or a chat value. |

Configure and verify the sender/domain in the provider dashboard, use credentials scoped to sending, and configure the trusted frontend origin to point at the deployed reset route. Store secrets through local/server environment configuration; no environment file is edited by this task. Deploy frontend SPA rewrites for direct navigation to all four auth pages. HTTPS is required outside the existing explicit loopback-only development exception.

Run the existing explicit initialization command against the intended database after reviewing it:

```powershell
npm.cmd run auth:init
```

It now includes passwordresettokens and its indexes alongside users/refreshsessions. Re-run this initialization for deployments previously initialized under Task 3. It does not seed users, drop indexes or alter manuscript collections. It was **not** run against Atlas during this task. Existing conflicting indexes or duplicate token-hash data require an explicit migration review, not syncIndexes/drop operations.

Rate limits reuse the bounded per-process limiter: forgot 5/IP/15 minutes and 3/normalized-email/15 minutes, reset 10/IP/15 minutes, change 5/IP/15 minutes. Email bucket keys are hashes, including for nonexistent accounts. These counters do not disclose account existence, but do reset on restart and are not shared across replicas. Keep a shared/edge limiter for multi-instance deployment. Generic messages and background email avoid direct enumeration and provider-latency disclosure; database paths are not claimed to be cryptographically constant-time.

## Validation and file inventory

Executed validation: the complete backend suite passed all 103 tests, including 19 password-recovery tests. The frontend suite passed all 19 tests, including 4 new recovery tests. Frontend lint and production build passed; the build's PDF/source consistency guard passed all 32 checks without modifying the database. No real provider delivery or Atlas initialization was performed.

Recovery tests use a disposable one-node replica set with TTL cleanup disabled to prove explicit expiry checks. They cover token hashing/uniqueness, normal and failed delivery, account-neutral responses, replacement invalidation, expired/used/unknown tokens, simultaneous reset attempts, complete rollback, every-session and access-token invalidation, identity spoofing, weak passwords/confirmation, monotonic dates, stale-login races, CSRF/rate limits and logs. A separate standalone test verifies safe refusal without partial credential writes. Frontend tests cover service payloads, temporary credentials, password validation, recovery URL parsing/scrubbing and route rendering. No in-app browser was available; click/focus behavior and deployment cookie/email behavior are not visually certified.

Created:

- backend/src/utils/passwords.js
- backend/src/models/PasswordResetToken.js
- backend/src/config/passwordRecovery.js
- backend/src/services/passwordRecoveryStorage.js
- backend/src/emails/passwordReset.js
- backend/src/services/email.service.js
- backend/src/services/passwordRecovery.service.js
- backend/src/controllers/passwordRecovery.controller.js
- backend/tests/password-recovery.test.js
- backend/docs/PASSWORD_RECOVERY.md
- frontend/src/features/auth/passwordPolicy.js
- frontend/src/features/auth/AccountForm.jsx
- frontend/src/features/auth/resetLink.js
- frontend/src/pages/Auth/ChangePassword.jsx
- frontend/tests/password-recovery.test.mjs

Modified:

- backend/src/services/auth.service.js: share password policy/hashing and input validation.
- backend/src/utils/tokens.js: generalize the existing opaque-token helper while preserving refresh-token hashing compatibility.
- backend/src/services/authStorage.js: initialize the separate reset collection/indexes.
- backend/src/services/session.service.js: revoke all account sessions and serialize replica-set logins with credential changes.
- backend/src/routes/auth.routes.js: three new protected/rate-limited routes.
- backend/src/middleware/auth.middleware.js: reusable limiter key function for normalized-email buckets.
- backend/src/app.js: reliably exclude mounted auth URLs from access logs using originalUrl.
- backend/scripts/initialize-auth-storage.js: describe reset storage initialization in its result.
- backend/docs/AUTHENTICATION.md: link the current recovery and frontend behavior.
- frontend/src/services/auth.service.js: recovery/change methods and post-change local sign-out.
- frontend/src/pages/Auth/ForgotPassword.jsx
- frontend/src/pages/Auth/ResetPassword.jsx
- frontend/src/pages/Auth/Login.jsx
- frontend/src/routes/AppRoutes.jsx
