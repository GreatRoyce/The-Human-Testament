# Core authentication

Task 4 adds password recovery, password changes, email delivery and minimal login/recovery screens. See [PASSWORD_RECOVERY.md](PASSWORD_RECOVERY.md) for the current endpoints, configuration, transaction requirements and file inventory. The core Task 3 API contract and token/cookie rules below remain in effect.

Task 5 adds verification/resend, registration verification emails and internal administrative lifecycle management. See [EMAIL_VERIFICATION.md](EMAIL_VERIFICATION.md) for the current ownership/status rules, configuration, initialization and validation report.

Task 6 refines the authenticated request context and adds composable authorization and private-owner helpers. See [AUTHORIZATION.md](AUTHORIZATION.md) for role defaults, owner-scoped operations, safe errors and the test-only resource fixture. No personal-data product route or privileged role is added.

Task 7 adds GET/PATCH /api/users/me and /account/settings with display-name-only editing. See [USER_PROFILES.md](USER_PROFILES.md) for the narrower safe-profile response, email-change deferral, CORS/CSRF handling, session policy and validation report. Existing /api/auth contracts below remain unchanged.

The checkout contained the User model but no Task 2 RefreshSession model or token utilities. This implementation adds the minimum separate session/token prerequisites and the four requested authentication endpoints. It reuses CommonJS, Express middleware/controllers/services, Mongoose, bcryptjs, jsonwebtoken, node:test, and mongodb-memory-server. No dependency, real account, production record, manuscript, edition, publication decision, or frontend screen is changed.

## HTTP contract

All responses use the existing `success/data` or `success/message` envelope and `Cache-Control: no-store`.

| Endpoint | Input | Result |
| --- | --- | --- |
| POST /api/auth/register | JSON email, password, displayName | 201 with data.user; attempt verification email; no automatic login or ownership grant |
| POST /api/auth/login | JSON email, password | 200 with data.user, data.accessToken, data.expiresIn; refresh cookie |
| POST /api/auth/logout | JSON object, current refresh cookie | 200 with data.message; revoke that session and clear cookie; repeated calls are safe |
| GET /api/auth/me | Authorization: Bearer access-token | 200 with data.user, or 401 for missing/invalid/expired/revoked authentication |

Safe user profiles contain only id, email, displayName, role, emailVerified, isActive. Registration/login reject all unknown body fields, including role, isActive, emailVerified, passwordHash and userId. The User model still allows only the user role. Logout never takes a target user/session ID from request data; it identifies the current session solely by its cookie credential. GET /me derives identity from verified claims plus database state, ignoring arbitrary userId headers/query parameters.

Registration normalizes email through the User model's existing validation rules and uses its 1–80 character display-name limit. Passwords require at least 12 Unicode code points, at most 72 UTF-8 bytes, nonblank content, and no ASCII control characters. They are not trimmed or silently truncated. Passphrases are supported without composition rules. bcryptjs hashes use cost 12. Syntax checks do not prove email ownership; emailVerified remains false. Registration, reset and change now share utils/passwords.js; recovery/email behavior is documented in PASSWORD_RECOVERY.md.

Duplicate email returns 409 with an explicit account-already-exists message, including case variants and insert races. This deliberately permits registration-based account enumeration. Login returns the same 401 message for unknown accounts, wrong passwords and inactive accounts. Unknown, syntactically valid accounts perform a dummy bcrypt comparison; this reduces obvious timing differences, not a claim of network-level constant timing. Malformed bodies use 400; bad CSRF/origin 403; wrong media type 415; rate limits 429; unavailable auth configuration/storage 503. Internal errors and malformed JSON never echo request bodies, stack traces, driver messages or tokens. Auth request URLs are excluded from request logging.

## Credentials and revocation

Access tokens are HS256 JWTs lasting 15 minutes, restricted to the configured server secret, fixed issuer/audience and access-token purpose. They bind a user ID to a session ID and the user's password-change date. Bearer authentication queries both the current user and the exact active, unexpired session, so inactive/deleted users, changed passwords, expired sessions and logout revocations invalidate protected access immediately. This implementation is deliberately not purely stateless; JWT signatures alone do not authorize a revoked session. Reuse `authenticate` after `authReady` on future protected routes. Role authorization remains separate.

The refresh credential is 32 random bytes encoded as base64url. Only its SHA-256 hash is stored in RefreshSession, alongside user, expiresAt, revokedAt and timestamps. It never enters the User document, response JSON or browser storage. The cookie carries the raw credential to the browser as required for session delivery. Session lifetime is 30 days; expiry is checked synchronously, independent of eventual TTL cleanup. Other devices/users remain signed in when the current session logs out. Multiple login sessions are allowed; login does not revoke existing unrelated sessions.

POST /refresh, refresh rotation/reuse detection and logout-all remain unimplemented. Task 4 adds password recovery and every-session revocation on credential changes; Task 5 adds email verification and every-session revocation on administrative lifecycle transitions. Until a refresh endpoint is separately implemented, access expiry or page reload requires login again. There is no claim that automatic token renewal works.

## Browser, CORS and CSRF

Production refresh cookies are host-only `__Secure-htt_refresh`, HttpOnly, Secure, SameSite=Lax, Path=/api/auth. Clearing uses the same name/path/security/SameSite attributes. Use HTTPS for frontend and API, preferably under the same site. For genuinely different sites, explicitly choose SameSite=None; Secure remains required, and third-party cookie blocking may still prevent sessions. No browser automation certified real deployment cookie policy in this task.

Every auth mutation, including login/registration/logout, requires all three: an exact allowed Origin, `X-CSRF-Protection: 1`, and application/json. The non-simple header plus exact credentialed CORS allowlist prevents cross-origin forms/scripts from exercising cookie-authenticated actions; SameSite is an additional defense. Missing/null/disallowed origins are rejected. Server/native clients must supply the approved Origin and header too; neither proves identity. GET /me uses only the Bearer token for authentication. Public manuscript CORS behavior stays unchanged.

`frontend/src/services/auth.service.js` uses the existing API client with POST support and credentials: include. The service owns access tokens only in its closure, never localStorage/sessionStorage, and never exposes them from login to components. Logout clears memory even if the network request fails, but propagates that error: a failed server request does not certify server-side revocation. Browser cookies remain inaccessible to JavaScript. A new service/page load has no access token. Task 4 wires minimal login, forgot/reset/change forms through this service. Registration UI and AuthContext remain placeholders; manuscript rendering is unchanged.

## Deployment and initialization

Required variables, by name only:

- AUTH_ENABLED: explicitly enable authentication. Without it, auth returns 503 while PDF content can still run.
- MONGODB_URI: existing Atlas connection setting; authentication connects even when CONTENT_SOURCE is pdf.
- AUTH_ACCESS_TOKEN_SECRET: independent high-entropy server-only signing secret, at least 32 random bytes. Never expose it as a VITE variable.
- AUTH_ALLOWED_ORIGINS: comma-separated exact frontend origins, including scheme and port; no wildcards, paths, credentials or trailing slashes.

Optional deployment settings:

- AUTH_COOKIE_SAME_SITE: strict, lax (default), or none, chosen for the actual site topology.
- AUTH_TRUST_PROXY_HOPS: default zero; set only to the actual fixed number of trusted reverse proxies. Prevent direct access that could bypass those proxies; an incorrect hop count can make client-IP rate limits spoofable.
- AUTH_ALLOW_INSECURE_LOCALHOST: explicit local-development-only HTTP exception. Forbidden in production and with SameSite=None. All allowed origins, the API hostname and its socket peer must be loopback. This uses the separate htt_refresh cookie with Secure disabled; never use it for a hosted deployment.
- VITE_API_URL: existing public frontend API origin. Auth is mounted at /api/auth; if proxying under another prefix, preserve/rewrite the cookie path consistently.
- NODE_ENV and PORT: existing runtime settings. Production must use TLS termination and enforce HTTPS at its proxy.

No secrets/environment file is written by this task. Before enabling account traffic, connect to the intended database and run this explicit initialization command from backend:

```powershell
npm.cmd run auth:init
```

It creates users, refreshsessions, passwordresettokens and emailverificationtokens with their declared indexes, without seeding accounts or editing manuscript collections. It is **not run against Atlas by the coding task**. Audit any existing users collection and resolve normalized/case-equivalent duplicates first; conflicting indexes require an explicit migration. No syncIndexes/drop operation runs against configured storage. Initialization/index failures log only sanitized error names/codes.

Automatic collection/index creation stays disabled. Startup and auth requests verify the required case-insensitive unique email index, unique session token-hash index and session TTL index; missing/mismatched storage fails closed. The existing database diagnostic command remains a read-only content-publication diagnostic.

Rate limits are bounded in-process, per client IP and 15-minute window: registration 20, login 10, logout 60. Exceeded limits return 429 with Retry-After. Forwarded IPs are ignored unless the controlled proxy configuration enables them. Counters reset on process restart and are not shared between replicas; add a shared/edge limiter before multi-instance deployment. They do not claim to prevent distributed attacks.

## Validation and changed files

Tests use synthetic accounts in disposable loopback databases, never .env, Atlas credentials or production users. They cover the requested endpoint cases, real uniqueness, session hashing/revocation/expiry, JWT algorithm/issuer/audience checks, impersonation attempts, account deactivation/password changes, cookies, CSRF/CORS, rate limits, unavailable configuration/indexes, safe errors, and the real frontend service through HTTP (with a simulated cookie jar).

Executed validation: backend **84 tests passed**, including **21 auth/session tests**; frontend **15 tests passed**, including four new service tests; frontend lint/build passed. The production build also passed the complete PDF/content consistency guard. Tests do not establish browser cookie behavior on a live HTTPS deployment, multi-instance rate limiting, or Atlas deployment readiness.

Created:

- backend/src/config/auth.js
- backend/src/models/RefreshSession.js
- backend/src/utils/tokens.js
- backend/src/services/authStorage.js
- backend/src/services/session.service.js
- backend/src/services/auth.service.js
- backend/src/middleware/auth.middleware.js
- backend/src/controllers/auth.controller.js
- backend/src/routes/auth.routes.js
- backend/scripts/initialize-auth-storage.js
- backend/tests/auth.test.js
- backend/docs/AUTHENTICATION.md
- frontend/tests/auth-service.test.mjs

Modified:

- backend/package.json: explicit auth:init command; no dependency changes.
- backend/src/app.js: mount auth, scoped credentialed CORS and skip auth URL logging.
- backend/src/server.js: auth configuration, explicit database readiness and trusted-proxy settings.
- backend/src/config/db.js: sanitize connection-failure logs.
- backend/src/middleware/error.middleware.js: safe auth/body-parser error statuses.
- frontend/src/services/api/client.js: shared POST/header/credential support and sanitized auth errors.
- frontend/src/services/auth.service.js: fill the existing empty service using the common client.
