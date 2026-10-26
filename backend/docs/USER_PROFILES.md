# User profiles and account settings

Task 7 adds authenticated profile retrieval/display-name editing and the minimum account-settings screen. It reuses the existing User model, CommonJS controller/service/route pattern, authentication and authorization middleware, shared frontend transport, and token-owning auth service. No dependency, User field, preference, secret, production database record, manuscript text or publication decision was added or changed.

## API contract

| Endpoint | Input | Result |
| --- | --- | --- |
| GET /api/users/me | Existing Bearer access token; no query parameters | 200 with success/data.user containing the authenticated account's safe profile |
| PATCH /api/users/me | Existing Bearer access token and exact JSON object containing displayName | 200 with the updated safe profile |

The profile contains exactly id, displayName, email, emailVerified and createdAt. id is the stable User ObjectId rendered as a string; createdAt is the existing Mongoose timestamp serialized as an ISO date. Explicit database projection and response mapping exclude passwordHash, session/recovery/verification credentials, role, isActive, passwordChangedAt, internal version and update timestamp. There are no supported profile preferences. Existing /api/auth/me/login/registration response contracts remain unchanged; account settings use the new narrower profile contract.

Only displayName can be patched. The existing User setter trims it, and User schema validation enforces 1–80 string characters and rejection of embedded ASCII control characters. Missing, empty/blank, non-string, oversized and invalid values return sanitized 400 errors. Unknown fields are rejected, including email, role, verification/activity flags, credentials, user IDs, timestamps, preferences, dotted keys and MongoDB operators. Mixed valid/invalid bodies cause no partial edit. The server constructs the display-name-only $set and enables update validators.

The target account is always auth.user._id from the existing authenticated request context. Queries additionally require isActive true. Request headers do not override identity, all profile query parameters are rejected with 400, and /api/users/:id is not an available account-lookup/update route. Missing/invalid/expired/revoked authentication, password-change invalidation and inactivity retain their existing 401 behavior. Missing/deactivated accounts discovered during the profile query fail closed. Unverified active users may view/edit their profiles; ownership verification remains feature-specific and public reading stays public.

Both endpoints use authReady/authenticate and no-store responses. PATCH also requires exact allowed Origin, X-CSRF-Protection: 1 and application/json, plus the existing bounded limiter configured for 30 edits/IP/15 minutes. /api/users uses credentialed allowlisted CORS with GET/PATCH/OPTIONS; arbitrary origins receive no CORS grant. Existing auth CORS methods remain unchanged. Malformed JSON on either account namespace is noncacheable and sanitized, and both namespaces are excluded from development access logging. This does not replace deployment logging controls.

## Session and account security

Display-name edits change only displayName and the normal updatedAt timestamp. They do not change identity, role, ownership/activity flags, password credentials/dates, or revoke sessions. Other devices retain access and the next profile/auth lookup sees the new name. There is no cached profile or second permission system.

Verification, password reset/change, logout and administrative deactivation remain in their dedicated services. Tests verify that profile editing cannot grant email verification, successful verification is reflected by the profile API, credential changes invalidate profile access, and deactivation revokes access on both profile verbs. Session listing, refresh rotation, logout-all and new session-management endpoints are outside this task. Existing logout still revokes only the cookie-bound session and clears local access; password changes retain every-session revocation.

These operations use normal request-time authorization plus an active-account condition in their database query. A display-name edit is not a security-state mutation and does not add a transaction or alter the established session strategy. Future sensitive account mutations must use their own recent-authentication and atomic consistency design.

## Email changes deferred

Email delivery code and isolated provider tests exist, but a local configuration-presence check found MAIL_PROVIDER, MAIL_FROM, RESEND_API_KEY and EMAIL_VERIFICATION_FRONTEND_URL unconfigured, with delivery disabled. No secret values were printed, no environment file was edited, and no mail was sent. Live delivery therefore is not an operational prerequisite established by this checkout.

Following Task 7's conditional scope, there is no PATCH /api/users/me/email and no generic assignment to User.email. The existing mailbox remains the login/recovery identity; profile edits cannot change it. Account settings explicitly display email read-only and state that address changes are unavailable.

Follow-up work requires configuring/verifying live delivery and designing the complete address-change flow: current-password/recent-authentication confirmation, pending new-mailbox ownership bound to its verification credential, normalized unique-address enforcement and safe duplicate-key handling, an explicit rule for when the old address stops working, old-address notification, replacement invalidation, and consistent session revocation. Merely enabling delivery does not silently enable address changes. No weaker partial workflow is exposed.

## Frontend behavior

The /account/settings route fills the existing Settings placeholder using ContentPage, useResource, ResourceState, Button and the existing typography/colors. Login now leads there, and the existing password page links back. The screen shows email, verification status, account creation date and a prefilled display-name editor, with validation/success feedback, disabled controls during requests, a password-change link, the existing verification notice and logout.

An unauthenticated load offers login. A save returning 401 hides the form and asks for a fresh login. Normal validation/network failures leave editing available. Successful saves display the normalized server value and preserve the session. Logout delegates to the existing auth service and hides profile content afterward; if the server cannot be reached, the screen accurately says local sign-out completed but server revocation was not confirmed. This does not claim remote revocation on a failed request.

The existing frontend auth service owns getProfile/updateProfile so Bearer credentials remain in its private closure. No token getter, second token store or duplicate fetch implementation is added. It sends only displayName in PATCH, validates the strict safe-profile response, preserves local access on 400, and clears it on 401. The shared API client gains PATCH JSON transport and safe /api/users error parsing. No profile or credential is written to localStorage/sessionStorage. Blank user.service/Profile scaffolds remain unused rather than adding a competing service pattern.

Automatic session renewal is still unimplemented: access expiry or a page reload requires login again. The account settings page works within that established behavior. Direct navigation needs the existing SPA rewrite configuration. No new backend initialization/index migration is required; existing auth initialization remains a prerequisite.

## Validation and file inventory

Executed checks: the targeted profile suite passed all 15 tests. The final complete backend run passed all 158 tests with zero failures/skips. The frontend suite passed all 27 tests, including 5 new profile tests; lint and production build passed. The build's PDF/source guard passed all 32 checks, confirmed 10 data files unchanged, and reported databaseModified false/importApproved false. Existing large-bundle and older Mongoose new-option deprecation warnings remain.

An initial backend run alongside the frontend tests/lint/build reported one failure and 151 executed tests. A captured backend-only full rerun with unchanged code/tests passed all 158. That initial failure was not reproduced and its cause was not confirmed; it is not represented as a proven application fix or an identified environment error.

New backend tests use synthetic accounts in a disposable local replica set, never .env/Atlas or real mail. They cover exact safe profiles and timestamps, both authentication verbs, trimming/bounds/controls/types, privileged/unknown/operator rejection, spoofed IDs, no partial edits, purpose-specific credential exclusion, verification/session preservation, password-change/deactivation revocation, CORS/CSRF/media/JSON handling, rate limiting, deferred email/session endpoints, public content, and the real frontend service through HTTP. Direct service calls without trusted context also fail closed.

Frontend tests cover shared transport/headers/payloads, strict profile decoding, safe validation errors, session clearing/preservation, matching name validation, settings route rendering and form/read-only fields/navigation. The in-app browser connection was unavailable; visual, click/focus and real browser cookie behavior remain unverified. No existing test was weakened or removed.

Created (8):

- backend/src/services/user.service.js
- backend/src/controllers/user.controller.js
- backend/src/routes/user.routes.js
- backend/tests/user-profile.test.js
- backend/docs/USER_PROFILES.md
- frontend/src/features/account/profileValidation.js
- frontend/src/features/account/AccountSettingsForm.jsx
- frontend/tests/user-profile.test.mjs

Modified (11):

- backend/src/app.js: mount the users router and omit account URLs from development logs.
- backend/src/config/auth.js: share account-path detection and add credentialed users CORS/PATCH preflight handling.
- backend/src/middleware/error.middleware.js: preserve no-store errors for the users namespace.
- backend/docs/AUTHENTICATION.md: link current profile/settings behavior.
- backend/docs/AUTHORIZATION.md: document the new strictly allowlisted profile update.
- frontend/src/services/api/client.js: add PATCH and safe account-profile error parsing.
- frontend/src/services/auth.service.js: authenticated safe-profile retrieval/update without exposing tokens.
- frontend/src/pages/Account/Settings.jsx: implement the existing settings placeholder.
- frontend/src/routes/AppRoutes.jsx: mount /account/settings.
- frontend/src/pages/Auth/Login.jsx: navigate to settings after login.
- frontend/src/pages/Auth/ChangePassword.jsx: link back to account settings.
