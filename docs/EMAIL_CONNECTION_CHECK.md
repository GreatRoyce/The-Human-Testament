# Local email/account integration check

Checked on 2026-11-13. This records local development validation, not a production
deployment or release approval.

## Configuration completed

- Local frontend: `http://localhost:5173`, with public API URL
  `http://localhost:5000`.
- Backend: local authentication and Gmail delivery enabled, generated private
  signing secret, exact frontend origin, and frontend verification/reset URLs.
- Configured MongoDB database: `The_Human_Testament`. Transaction support was
  verified. Existing account and notification initialization routines created
  the required collections/indexes; no manuscript content was changed.
- Frontend and backend `.env` files remain ignored and untracked. No OAuth
  credential, generated password, signing secret, or raw account link is in this
  report or committed examples.

## Results

| Check | Result |
| --- | --- |
| Full frontend suite, including isolated real-HTTP frontend/backend integration | 92 tests passed |
| Frontend lint | Passed |
| Production frontend build using the intended HTTPS API URL as a build-time override | Passed; existing large-bundle warning remains |
| Running frontend API configuration and backend readiness | Passed |
| Register/login/verification/reset frontend routes served by Vite | HTTP 200 |
| Credentialed CORS for the configured frontend | Passed; unrelated origin rejected in automated integration |
| Live registration through frontend auth service and real backend/Atlas | Passed |
| Live Gmail verification message | Google accepted |
| Verify link consumption and verified account state | Passed; reuse rejected |
| Live Gmail password reset message | Google accepted |
| Password change through reset | Passed; old password rejected, new password accepted |
| Reset token reuse and previous session | Reuse rejected; previous session revoked |
| Temporary live test account | Deactivated; its sessions and links revoked |

The repeatable regression test uses an isolated local MongoDB replica set and an
in-memory email double. It never loads local credentials or contacts Atlas/Gmail.

The separate authorized live check used the configured database and actual Gmail
adapter. It captured generated account links only in process memory before
delivery, then submitted them through the frontend authentication service's real
HTTP transport. Both live messages targeted a unique plus-address of the
Workspace inbox. No existing reader account or Google account password was
changed.

## Limits

The browser automation tool stopped because it could not determine the current
browser URL reliably. Browser form interaction, cookie persistence in a real
browser, visual layout, and actual inbox receipt were not independently
verified. HTTP route checks and server-render tests are not browser evidence.
Google acceptance is not a guarantee of inbox delivery.

The local Node runtime is 22.16.0. Production's existing runtime validator requires
a newer reviewed security floor; these local results do not waive that check.
Existing Mongoose `new` option deprecation warnings were observed; the account
flow tests passed without changing those unrelated call sites.

Before hosting, supply production environment values separately in Render and
Vercel, switch local origins to the actual HTTPS domains, configure the production
cookie/proxy settings, and repeat live account flows. A Git push does not transfer
the ignored local `.env` files. Follow [the deployment runbook](../backend/docs/DEPLOYMENT.md)
for remaining release prerequisites.
