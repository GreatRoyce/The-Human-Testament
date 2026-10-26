# Notifications and reader activity (Task 13)

The application now has a private in-app notification centre for supported community and publishing activity. Notifications are independent records, never canonical manuscript content. No private-note content, article/discussion prose, titles, moderation reasons, report details, passwords, recovery credentials or session secrets are copied into them. No dependency, environment file, manuscript dataset, ingestion, edition or publication approval was changed.

## Model, storage and retention

`Notification` contains an immutable required recipient User reference, an optional immutable actor User reference, a defined type, immutable resource type/ID, an optional fixed display message, optional readAt (default null), and an automatically managed createdAt. An internal immutable eventKey supports deduplication and is excluded from normal selection and API responses.

Messages come from a short server-controlled enum, bounded to 120 UTF-16 units. The model validates the event/resource-type pairing and matching message; arbitrary client text is never a notification payload. Actor names are resolved from the current public display-name field when permitted, rather than stored as historical copies. Ordinary API responses exclude recipient, eventKey, email, credentials, document versions and internal moderation metadata.

Named database indexes:

- `notification_recipient_event_unique`: unique `{recipient:1,eventKey:1}`.
- `notification_recipient_recent`: `{recipient:1,createdAt:-1,_id:-1}`.
- `notification_recipient_unread`: `{recipient:1,readAt:1,createdAt:-1,_id:-1}`.

Retention is explicit: read and unread notifications are retained without automatic deletion. There is no TTL, user deletion endpoint or background pruning job. Read/unavailable records remain acknowledgeable history. Storage readiness rejects missing/weakened indexes and unexpected TTL indexes. Operators must separately review any future retention/erasure policy, including preserving event deduplication if records are purged. This task did not erase existing records.

## Supported events

| Type | Trigger and recipient | Navigation policy |
| --- | --- | --- |
| `discussion_comment` | A new flat comment, to its discussion's author | Discussion, only while the comment/discussion and circle access remain available |
| `article_approved` | Peer publication approval, to the article author | Author's own article management view |
| `article_rejected` | Rejected submission, to the article author | Author's own article, where the existing review reason can be read |
| `content_moderated` | Hide/restore/lock/unlock/remove of a discussion/comment, or unpublish/archive of an article, to its author | Existing resource only when readable; own hidden/deleted discussion/comment receives a generic notice without a link |
| `circle_invitation` | A new or renewed pending invitation, to its recipient | Own invitation list; accepted invitations may link to the accessible circle |
| `circle_membership_changed` | Actual status/role change, to the affected member | Accessible circle, or a generic acknowledgement of one's own membership record without an actor/link after removal |
| `report_reviewed` | Reviewed reported-content case, to its reporter | Generic private acknowledgement; no moderator, private target, review reason or privileged queue link |
| `report_resolved` | Resolved case, to its reporter | Same generic acknowledgement policy |

There are no comment-reply notifications because comments are flat. There are no article-comment, page-view, scroll, reading-progress, private-note, chat, subscription or unsupported-event triggers. Notifications go to the directly involved recipient, not all circle members or all thread participants. Self-notifications are suppressed centrally; self-comments and voluntary join/leave actions do not create notices to the actor. Existing self-moderation/self-report-review restrictions still apply.

## Creation, idempotency and delivery

The producer is an internal transaction-only service, with no public creation endpoint. It derives recipients from actual discussion/article authors, circle membership records or report ownership. It requires an active recipient and verifies the relevant resource relationship and access inside the originating transaction. Ordinary source requests cannot assign a notification recipient or message.

Comments use the persisted comment ID as the event identity. Content decisions use their persisted moderation audit ID. Membership notices use membership ID and its existing Mongoose version, incremented for actual status/role transitions; repeating an existing pending invitation or role assignment does not emit another notice. Report status acknowledgements deduplicate by report ID/status for that reporter's lifetime. A unique index and insert-only upsert enforce one notification per recipient/event, preserving original createdAt/readAt on replay. No read timestamp is reset by event retries.

Deduplication applies to the same durable event. Existing comment POSTs have no general client idempotency-key contract: two requests that create two distinct comments are two actual events and produce two notifications. This task does not silently collapse legitimate identical comments or claim exactly-once HTTP request execution.

Notification writes share the original MongoDB transaction. A committed comment, moderation decision or membership change and its notice commit together; rolled-back source/audit changes leave no phantom notices. A notification database/index failure aborts the originating transaction rather than committing an event with a lost notification. Reads and writes use existing transaction/session and authorization conventions. This creates an intentional deployment dependency: notification storage must be initialized before emitting operations are enabled. Public manuscript access, account authentication and public community reads do not depend on notification storage.

This is **in-app delivery only**. Inspection found password-recovery/verification mail adapters, but no activity-email preferences or durable activity-email worker. Neither recovery nor verification mail is repurposed as a notification channel. No activity email is attempted; mocked email-provider failures cannot break source operations because these paths do not call the provider. There is no email queue, retry worker, guaranteed email acceptance/inbox delivery, push, SMS or live socket delivery in this task. Future email requires opt-in preferences, a durable delivery/outbox worker, provider idempotency, permission checks and tests before enabling it. Database atomicity is not a claim of external email delivery.

## Ownership and privacy

All four endpoints require the existing live authenticated active account/session. Email verification is not required to read/acknowledge one's own inbox. Community/article source writes retain their existing verified-email, role, origin and posting gates; notification read actions remain available while community posting is disabled.

Every list, count and mutation filters by the authenticated recipient. Foreign, malformed and nonexistent notification IDs have the same 404. Read mutations accept only an empty JSON body and no query parameters; guessed IDs, recipient fields, readAt input and MongoDB operators cannot change ownership. There is no ordinary notification-create, delete or transfer route.

Access is checked again at each inbox read, not only when an event is created:

- Private discussion/comment notices use the existing circle visibility/ownership rule. Revoked membership cannot expose an old circle/discussion link, actor, type or resource ID. The record becomes type `unavailable` with a fixed generic message, null actor/resource type/resource ID/link. No copied title or prose can linger in the inbox.
- Pending invitation metadata belongs to its recipient. Revoked/declined invitation notices become unavailable. A removal/role-change acknowledgement may remain as a generic update about the recipient's own membership record; it contains no circle ID, actor or private link after removal. It does not grant circle access.
- Report acknowledgements belong to the reporter's own case and remain generic even if private target access changes. They never contain target/circle IDs, report details, reviewer identities or internal decisions. Their resource ID is only the reporter's own report ID; they do not create access to the moderator queue.
- An article author's notification can link to their existing own-management endpoint, including a rejected or archived article. It grants no access to another author's draft.
- Missing/deleted resources become unavailable. Missing/inactive actors resolve to null without breaking the list. Moderation/report actors are suppressed from ordinary notification DTOs to avoid disclosing internal reviewer identity. Current actor IDs/display names are shown only for permitted comment/invitation/membership events.
- Unavailable rows remain in the list and unread count until acknowledged, so counts match retained inbox records. Notifications do not automatically mark themselves read when opened. The destination endpoint checks access again if permission changes after an inbox response.

Only fixed messages and bounded current display names reach the UI. React escapes messages and actors, and the frontend validates strict response fields and a small allowlist of relative resource destinations. No arbitrary external URL or privileged API queue link is accepted.

## API

| Method | Endpoint | Response data |
| --- | --- | --- |
| GET | `/api/notifications` | `{items,pagination}` for the current recipient |
| GET | `/api/notifications/unread-count` | `{unreadCount}` |
| PATCH | `/api/notifications/:id/read` | `{item}` with its first readAt; JSON `{}` |
| POST | `/api/notifications/read-all` | `{markedCount}`; JSON `{}` |

All responses use existing success/error envelopes and `Cache-Control: no-store`. Notification paths participate in the existing credentialed CORS allowlist and development-log exclusions. Mutations require an allowlisted Origin, JSON and `X-CSRF-Protection: 1`.

List queries accept only page/limit, defaulting to 1/20, capped at page 10,000 and limit 50. Ordering is createdAt descending with `_id` tie-breaker. Unknown/repeated/nested/malformed queries are rejected. Counts/list queries and the bulk acknowledgement have a five-second budget. Lists/counts are separate queries rather than a frozen concurrent-activity snapshot; refresh obtains current values. Read-one uses an atomic owner/unread update and preserves the first readAt on retries. Read-all updates only that user's unread records visible to the operation, bounded by its start-time cutoff, without resetting already-read timestamps.

The existing bounded limiter enforces 180 requests/IP/15 minutes for notification routes, plus 60 read mutations/account/15 minutes. These process-local limits reset on restart and do not replace shared edge/distributed rate limiting for multi-instance deployment.

## Frontend

`/notifications` is a notification centre using the existing CommunityFrame, resource hook, error/empty/loading components, buttons and pagination. It shows the current unread count, read/unread rows, permitted resource links, explicit mark-one/read-all controls and a manual refresh button. Empty, unavailable-resource, expired-login, permission/error and retry states remain distinct.

An unread indicator links from community/article navigation, account settings and reader controls. It loads on mount/navigation rather than using a polling timer. The centre uses its own freshly loaded count while acknowledgements refresh its list/count together; its navigation link does not show a stale duplicate count. No notification request is needed to read the canonical manuscript. Anonymous indicator attempts stop before network transport and do not repeatedly change the session version. No background polling, push or realtime mechanism was introduced.

The existing authentication closure carries these requests, restricts notification destinations and rejects late responses after a session change. Tokens remain internal/in memory; no additional credential store/provider was introduced. The existing lack of automatic access renewal persists: full reload/expiry requires login again. Login accepts `/notifications` as an internal return destination. `VITE_API_URL` must point to the existing backend for inbox features, even when manuscript reading uses the PDF provider.

## Initialization and configuration

Run `npm run notifications:init` from backend against the intended existing database before enabling notification-producing operations. It creates only the notification collection and named indexes, never users, messages or emails. Existing deployments can use this focused command; explicit `community:init` now also initializes notification storage for a complete community installation. Required authentication/community/article storage and moderator/posting configuration remain governed by their existing setup instructions.

No new secret, email preference, provider configuration or runtime feature flag is required for in-app notifications. No production initialization, real account, real email, data migration execution or posting enablement was performed here. Conflicting unique indexes or duplicate pre-existing event keys fail initialization; repair requires an explicitly reviewed operator action. No destructive sync/drop-index migration is run by a request or initializer. Publication snapshots, audit retention, canonical collections and private notes are untouched.

Before production use, provision the collection/indexes, retain the current HTTPS/origin/CSRF/account/session protections, and use Atlas/a replica set for source transactions. Retention/erasure policies, database backup/access controls, distributed rate limiting and future email preferences/workers remain deployment responsibilities. No browser connections were available, so automated HTTP/contract/server-render tests are not a visual or browser-interaction review.

## Validation

Baseline: **232 backend tests passed**, **60 frontend tests passed**. New notification backend suite: **13 passed, 0 failed**. Final complete backend suite: **245 passed, 0 failed** (`npm test -- --test-concurrency=1`). Final complete frontend suite: **64 passed, 0 failed** (`npm test`). Frontend lint passed (`npm run lint`); production build passed with exit code 0 (`npm run build`). The read-only prebuild passed **32 manuscript fidelity checks**, confirmed PDF/shared manuscript consistency, all **10 data files unchanged**, `databaseModified:false` and `importApproved:false`. Existing 206 manuscript source warnings and the large-bundle build warning remain.

New tests cover supported triggers, self suppression, event replay and the real unique index, recipient validation, pagination/counts, atomic/idempotent acknowledgements, foreign/guessed IDs, body/query/origin attacks, private-circle revocation/invitation/role changes, unavailable actor/resources, article decisions and moderation, deduplicated reporter updates, inactive recipients, missing index readiness, email-provider isolation, source/audit rollback, safe stored/serialized data, unchanged canonical source, session-safe frontend transport, strict response/link validation, escaped actor/messages and notification route/list rendering.

MongoDB tests use only disposable loopback replica sets and synthetic accounts with mail disabled. Backend runs are serialized to avoid competing database startups. Existing tests were retained without weakening. The initialization script passed syntax checking; no live database/provider initialization is included in test claims.

## Task 13 file inventory

New backend files (9, including this report):

- `backend/src/models/Notification.js`
- `backend/src/services/notificationStorage.js`
- `backend/src/services/notificationResource.service.js`
- `backend/src/services/notificationEvents.service.js`
- `backend/src/services/notification.service.js`
- `backend/src/routes/notification.routes.js`
- `backend/scripts/initialize-notification-storage.js`
- `backend/tests/notifications.test.js`
- `backend/docs/NOTIFICATIONS.md`

Modified backend files (6):

- `backend/src/services/communityStorage.js` — explicit community initialization also creates notification storage.
- `backend/src/services/community.service.js` — transactional comment/membership/moderation/report triggers; existing circle access rule reuse.
- `backend/src/services/article.service.js` — transactional publication-decision triggers.
- `backend/src/app.js` — notification router.
- `backend/src/config/auth.js` — notification CORS/no-store/logging classification.
- `backend/package.json` — notifications:init script.

New frontend files (5):

- `frontend/src/services/notifications.service.js`
- `frontend/src/components/notifications/NotificationLink.jsx`
- `frontend/src/components/notifications/NotificationList.jsx`
- `frontend/src/pages/Account/Notifications.jsx`
- `frontend/tests/notifications.test.mjs`

Modified frontend files (7):

- `frontend/src/services/auth.service.js` — restricted notification paths and stable anonymous private-request session state.
- `frontend/src/services/api/client.js` — safe notification error parsing.
- `frontend/src/routes/AppRoutes.jsx` — centre route.
- `frontend/src/components/community/CommunityUI.jsx` — indicator navigation.
- `frontend/src/features/account/AccountSettingsForm.jsx` — indicator navigation.
- `frontend/src/features/reader/components/ReaderControls.jsx` — indicator navigation without protecting the reader route.
- `frontend/src/pages/Auth/Login.jsx` — notification return destination.

Total: **27 source/test/documentation files**. Temporary local logs and ignored build output are not source deliverables. Pre-existing changes from earlier tasks were preserved. No dependency or lockfile change was needed.
