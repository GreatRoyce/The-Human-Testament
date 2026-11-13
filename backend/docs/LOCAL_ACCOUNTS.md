# Local frontend/backend account connection

Run the backend on `http://localhost:5000` and Vite on
`http://localhost:5173`. Vite refuses a busy port rather than silently switching
origins and breaking account requests or emailed links.

Your ignored `frontend/.env` needs the public settings in
[`frontend/.env.development.example`](../../frontend/.env.development.example).
Keep `VITE_CONTENT_SOURCE=pdf` to preserve the existing manuscript projection;
account requests still use the backend through `VITE_API_URL`.

The ignored `backend/.env` needs these local settings alongside the existing
database URI, generated signing secret, and [Google credentials](GOOGLE_EMAIL.md):

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=5000
AUTH_ENABLED=true
AUTH_ALLOWED_ORIGINS=http://localhost:5173
AUTH_ALLOW_INSECURE_LOCALHOST=true
AUTH_COOKIE_SAME_SITE=lax
AUTH_TRUST_PROXY_HOPS=0
PASSWORD_RESET_FRONTEND_URL=http://localhost:5173
EMAIL_VERIFICATION_FRONTEND_URL=http://localhost:5173
PASSWORD_RESET_TTL_MINUTES=30
EMAIL_VERIFICATION_TTL_MINUTES=1440
MAIL_PROVIDER=gmail
MAIL_DELIVERY_ENABLED=true
MAIL_FROM="The Human Testament <hello@thehumantestament.com>"
```

Generate `AUTH_ACCESS_TOKEN_SECRET` once using a cryptographically random value
of at least 32 bytes, keep it private, and retain it between local restarts.
Never use this local signing secret as the production secret.

Against the intended transaction-capable database, initialize existing account
and notification storage once using `npm.cmd run auth:init` and
`npm.cmd run notifications:init` from `backend`. These create required
collections/indexes, not accounts or manuscript records. No indexes are dropped.

Start each server in its own terminal:

```powershell
# Terminal 1, backend directory
npm.cmd run dev

# Terminal 2, frontend directory
npm.cmd run dev
```

Open `http://localhost:5173/register`. Verification and reset links also point at
this frontend. Use the same computer for local links; localhost on a phone
points at the phone, not the development machine.

The automated integration test in `frontend/tests/auth-integration.test.mjs`
uses the real frontend HTTP client and backend routes with isolated local
MongoDB and an in-memory email transport. It does not read `.env`, contact Atlas,
or send Gmail messages. Run it with `npm.cmd test -- --test-concurrency=1` from
`frontend`, or target that file with Node's test runner.

## Hosted deployment

These local `.env` files are ignored by Git and are not transferred by a push.
Set production variables separately in Render and Vercel. Use the actual HTTPS
frontend/backend addresses, set `AUTH_ALLOW_INSECURE_LOCALHOST=false`, set the
Render backend's `HOST=0.0.0.0`, and use the production runtime required by
[DEPLOYMENT.md](DEPLOYMENT.md). Production authentication rejects insecure
localhost settings and the frontend build rejects an HTTP API URL.

Test live email delivery again after deployment: local integration tests do not
prove hosted DNS, cookies, Gmail delivery, or Render availability.
