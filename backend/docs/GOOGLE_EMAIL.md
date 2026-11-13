# Google Workspace email on Render Free

The backend sends verification and password reset messages through the Gmail API,
using the existing `hello@thehumantestament.com` Workspace mailbox. No Resend
account, SMTP password, extra mailbox, or `auth.thehumantestament.com` sending
domain is needed for this setup.

For the local frontend/backend connection, see [LOCAL_ACCOUNTS.md](LOCAL_ACCOUNTS.md).

Render Free blocks outbound SMTP ports 25, 465, and 587. Gmail API requests use
HTTPS instead. A free instance also sleeps after inactivity, so first requests
can be slow. This change does not remove those hosting limits or the release
prerequisites in [DEPLOYMENT.md](DEPLOYMENT.md).
[Render Free documentation](https://render.com/docs/free)

## 1. Create the Google project and enable Gmail API

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/) with the
   Workspace administrator account for `thehumantestament.com`.
2. Create a project named **The Human Testament Email** under your Workspace
   organization, then select that project.
3. Open **APIs & Services > Library**, search for **Gmail API**, and enable it.
4. Open **Google Auth platform > Branding** and complete the setup with your app
   name and support/contact email.
5. Set **Audience** to **Internal**. Only your Workspace mailbox authorizes this
   connection; public readers do not sign in to Google and do not authorize their
   own Gmail accounts. If Internal is unavailable, check the project's
   organization and signed-in account before proceeding.
6. Use only the send permission:

   ```text
   https://www.googleapis.com/auth/gmail.send
   ```

This scope allows sending without granting inbox-reading or message-deletion
access. Google documents [consent configuration](https://developers.google.com/workspace/guides/configure-oauth-consent)
and [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## 2. Create an OAuth client

In **Google Auth platform > Clients**, create an OAuth client with application
type **Web application** and name **Human Testament Mail Sender**.

Add this exact **Authorized redirect URI**:

```text
https://developers.google.com/oauthplayground
```

Save the client ID and client secret privately. This redirect is for Google's
one-time authorization tool; the website does not need a public Google callback
route or a Google login button.

## 3. Authorize the sending mailbox once

1. Open [Google's OAuth Playground](https://developers.google.com/oauthplayground/).
2. Open its settings (gear icon). Select **Use your own OAuth credentials** and
   enter the client ID and secret from your project. Keep Google's authorization
   endpoints, server-side flow, **Offline** access, and **Consent Screen** prompt.
3. In Step 1's custom scope field, enter only
   `https://www.googleapis.com/auth/gmail.send`, then click **Authorize APIs**.
4. Sign in specifically as `hello@thehumantestament.com` and approve sending.
5. In Step 2, click **Exchange authorization code for tokens**.
6. Save the **refresh token**, along with the matching client ID and secret, in
   your private backend configuration. An access token is short-lived and is not
   a substitute for the refresh token.

Use your own OAuth credentials: Playground's default credentials cause its
refresh tokens to be revoked after 24 hours. An External app left in Testing
also gets refresh tokens that expire after seven days for Gmail scopes. The
Internal configuration above avoids that external-testing limitation.
[Playground instructions](https://developers.google.com/oauthplayground/),
[Google refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)

Workspace policies may require the administrator to allow the internal app.
Password changes, revocation, and policy changes can invalidate authorization;
if that happens, repeat this step and replace the refresh token in the backend.
Do not paste secrets or token screenshots into chat, Git, or issue reports.

## 4. Configure the backend

For local development, add these settings to your existing ignored `backend/.env`.
Replace the three empty OAuth values with the credentials you saved privately.
The example below is incomplete until those values are supplied:

```dotenv
MAIL_PROVIDER=gmail
MAIL_DELIVERY_ENABLED=false
MAIL_FROM="The Human Testament <hello@thehumantestament.com>"
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

On Render, add these same variables in the backend service's **Environment**
settings. Production deliberately does not load a local `.env` file. Never put
these credentials into frontend `VITE_` variables.

Set `MAIL_DELIVERY_ENABLED=true` when the credentials and account configuration
are ready. Production authentication requires working mail configuration:

- `AUTH_ENABLED=true` with a generated `AUTH_ACCESS_TOKEN_SECRET`.
- `AUTH_ALLOWED_ORIGINS` containing the actual exact HTTPS frontend origin.
- `PASSWORD_RESET_FRONTEND_URL` and `EMAIL_VERIFICATION_FRONTEND_URL` set to that
  same frontend origin, without route paths.
- A transaction-capable MongoDB deployment and the initialized account and
  notification storage described in the deployment runbook.

`MAIL_FROM` accepts one plain ASCII mailbox or an ASCII display name followed by
one mailbox, as above. It must match the authorized mailbox or a send-as alias
already configured in Gmail. No mailbox password or `SMTP_PASS` is used.

## 5. Verify actual delivery

1. Deploy/restart with the backend settings and correct frontend API URL.
2. Register a synthetic account you control; check receipt of its verification
   email, open the link, and confirm the account becomes verified.
3. Request a password reset; check the email and complete the reset.
4. Check the From address, actual link destination, and spam placement. Confirm
   SPF, DKIM, and DMARC for Google Workspace in your Hostinger DNS; keep Google's
   existing MX records. [Hostinger's Workspace DNS guide](https://www.hostinger.com/support/1583453-how-to-set-up-a-domain-for-google-workspace-email-at-hostinger/)

Google's mailbox sending limits still apply, including trial-account limits.
They are shared with other mail sent by that mailbox. Monitor actual usage and
delivery before expanding traffic.
[Workspace sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace)

The adapter refreshes and temporarily caches access tokens in memory. Both
requests have deadlines, redirects are rejected, and provider errors remain
private. Gmail's returned message ID means accepted, not guaranteed inbox
delivery. It does not automatically retry ambiguous sends. Existing account
responses and token single-use rules are unchanged.
[Gmail sending API](https://developers.google.com/workspace/gmail/api/guides/sending)

The delivery queue is still in memory: a restart can lose pending delivery.
Readers can request a replacement link. Liveness/readiness probes and mocked
tests do not establish that real Gmail credentials or inbox delivery work.
