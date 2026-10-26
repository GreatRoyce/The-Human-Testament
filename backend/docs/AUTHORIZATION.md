# Authorization and private-resource ownership

Task 9 adds owner-scoped reading progress/history, transactional checkpoints and revision/idempotency guards using the same verified authentication context. See [READING_PROGRESS_AND_HISTORY.md](READING_PROGRESS_AND_HISTORY.md) for the current activity model, endpoints, frontend behavior, initialization and validation. Canonical content remains independent of private reading activity.

Current implementation: Task 8 adds account-owned bookmarks and private notes using this ownership pattern. See [SAVED_VERSES_AND_PRIVATE_NOTES.md](SAVED_VERSES_AND_PRIVATE_NOTES.md) for models, routes, indexes, frontend integration and current validation. The sections below record the original Task 6 scope; statements about absent personal-resource models/routes describe that earlier snapshot. The canonical editorial `Note` model remains unchanged and separate from the new `PrivateNote` model. The helper now optionally accepts `ownerField: 'user'` and distinct `createFields`/`writableFields`; default owner behavior and all canonical ownership restrictions remain intact.

Task 6 builds on the existing authentication/session system. It adds no product model, public endpoint, privileged role, dependency, environment variable or database migration. Canonical content, ingestion, approval records, edition snapshots and frontend files are unchanged. No Atlas database or real mail provider was used.

## Existing resources and policy

The only defined account role is user. There are no bookmark, progress, reading-history, personal-note, saved-passage or private-list backend models/routes. The frontend personal-notes service and protected-route component are empty scaffolds. The backend Note model represents canonical editorial material, not personal notes, and must not receive a private owner or new write routes.

Existing private account resources are already scoped: GET /api/auth/me uses the authenticated identity, change-password targets that identity and session, and logout revokes only the cookie-bound session. Recovery/verification credentials use their purpose-specific hashed-token flows rather than accepting an arbitrary account ID. These paths retain their existing policies. Account lifecycle mutation remains an internal service for a separately authorized administrative process; no public controller or role grant was added.

| Situation | Policy |
| --- | --- |
| Missing/invalid/expired authentication, missing/inactive user, expired/revoked session, stale password-change claim | 401 Authentication required |
| Required auth storage/configuration unavailable | Sanitized 503; infrastructure failures are not disguised as bad credentials |
| Authenticated active user on an ordinary private operation | Allowed only within that user's ownership scope |
| Unverified user on a feature explicitly requiring ownership verification | 403 with verification guidance |
| Reserved/unknown role, no allowed roles, or a role mismatch | 403 Forbidden; deny by default |
| Foreign, missing or malformed private record ID | Identical 404 Resource not found; no existence disclosure |
| Ownership/status injection, unknown write fields, update operators or query overrides | Generic 400 Invalid resource input |
| Canonical manuscript write method | No write route; existing JSON 404 behavior |

Anonymous and unverified users retain public manuscript access. Existing password management remains available to active unverified accounts. No ownership gate is added to reading. Ordinary account input cannot set role, emailVerified, isActive, passwordHash or another account ID: registration/change keep exact allowlists. Task 7 adds the displayName-only PATCH /api/users/me with the same authenticated identity and strict input policy; see [USER_PROFILES.md](USER_PROFILES.md). No privileged field is assignable through that endpoint.

## Authentication and authorization composition

auth.middleware.authenticate remains the sole access-token authentication implementation. It validates the HS256 signature, issuer, audience, expiry, purpose, subject/session identifiers and password-change claim through the established token utility. It reloads the current User and exact active RefreshSession, checks activity and passwordChangedAt, and attaches req.auth. JWT role/verification claims and userId values in bodies, queries or headers cannot establish identity or grant authority.

req.auth contains sessionId and a projected plain user object with _id, email, displayName, role, emailVerified, isActive and optional passwordChangedAt. The profile fields support the existing safe /me response; the date supports credential-change checks. Credentials, token hashes, internal version, unrelated timestamps and Mongoose document methods are absent. The context and user object are shallow-frozen against accidental reassignment. This is an internal request context, not a response serialization contract.

Compose authReady then authenticate on a protected router. authenticate already enforces current account activity; requireAuthenticated and requireActiveAccount are aliases for a fail-closed context guard for downstream composition. requireVerifiedEmail uses the same guard and checks the database-derived ownership flag. These guards do not parse credentials or create a second identity system, and must not be mounted without authenticate as a substitute for signature/session validation.

requireRoles(...allowed) accepts only roles declared by the existing User schema. requireRoles('user') can permit ordinary users; requireRoles(), requireRoles('admin'), unknown roles, and a mixed known/unknown list deny everyone. Even an unsupported admin value written by bypassing schema validation cannot enable a reserved-role gate. No administrator identity or provisioning path exists. A future privileged workflow must define its roles, trusted provisioning, permissions and approvals separately before any privileged operation can be enabled.

Password changes and administrative deactivation retain their tested revocation strategy: protected authentication reads current user/session state on every request, so previously issued JWTs cannot bypass revoked sessions or inactive accounts. Reactivation does not revive old sessions. Like ordinary request authorization, these checks establish a request-time snapshot; future especially sensitive or multi-document mutations must recheck/serialize account status within their own transaction, as password/lifecycle services already do. Automatic refresh remains unimplemented and is not claimed by this task.

## Reusable private-resource pattern

Apply models/privateOwner.js only to a future private-resource Mongoose schema. It adds a required immutable owner ObjectId referencing User, plus the compound owner/_id index. It refuses to overwrite an existing owner definition. Follow existing strict validation, timestamps and explicit collection/index initialization conventions when implementing an actual resource; this plugin does not instantiate any model or create production collections.

services/ownedResource.service.createOwnedResourceAccess(Model, { writableFields }) requires the owner contract and an explicit schema-field allowlist. It rejects protected ownership/account fields, unknown fields, dotted paths, operator keys and immutable fields in that configuration. It returns these individual-record operations:

| Method | Trusted inputs and database behavior |
| --- | --- |
| create(auth, body, query = {}) | Reject unknown fields/query options; create with owner derived exclusively from auth.user._id |
| findById(auth, id, query = {}) | Query findOne with both _id and owner |
| updateById(auth, id, body, query = {}) | Use findOneAndUpdate with both identifiers, a server-built $set, validators and the updated document returned |
| deleteById(auth, id, query = {}) | Use findOneAndDelete with both identifiers |

Pass req.auth, req.params.id, req.body and req.query from the controller; never take auth from req.body or merge a client filter into a database query. All individual-record query parameters are rejected. Updates and deletes enforce ownership in the mutation itself instead of checking a previously fetched record. Owner IDs cannot be changed through these methods, and the schema also prevents ordinary subsequent Mongoose saves from transferring ownership. Schema/cast failures on writes become sanitized 400 errors without echoing private values. Unexpected database failures use the existing safe global handler.

For a future controller, the intended calls are:

```javascript
// Model has the privateOwner plugin and resource-specific schema validation.
const records = createOwnedResourceAccess(Model, { writableFields: ['payload'] });
// Router already uses authReady and authenticate.
await records.findById(req.auth, req.params.id, req.query);
// Mutations also use protectMutation and suitable per-feature rate limits.
await records.create(req.auth, req.body, req.query);
await records.updateById(req.auth, req.params.id, req.body, req.query);
await records.deleteById(req.auth, req.params.id, req.query);
```

The helper is for private resources, not User, session, credential or canonical manuscript models. A missing owner contract prevents accidental use with editorial Note or other manuscript models. There is no privileged bypass of ownership. Direct model/driver writes bypass service policy and must never receive ordinary request input.

List/search/aggregation/population, bulk operations, sharing and administrator overrides are deliberately absent. Future implementations must scope every query/join to the authenticated owner, define safe pagination and projections, and receive their own authorization tests. No generic private-data endpoint or database collection is exposed by this task.

## Canonical manuscript protection

The public API registers GET/HEAD reading behavior for books, chapters, verses, supporting editorial material, glossary, cross-references, sections and search. No canonical POST/PUT/PATCH/DELETE handler or publishing endpoint is added. Authentication and role checks do not turn those read paths into write authority. Future editorial publishing requires its own explicit permissions and approval controls.

The tests exercise all four write methods for anonymous and ordinary authenticated requests across the canonical paths, plus nonexistent note/edition/ingestion/publication/admin paths, and verify the published verse remains readable with the same text. This checks the HTTP boundary; it does not claim that a database operator with direct write credentials is constrained by Express middleware.

## Validation and file inventory

Executed validation: `npm test -- tests/authorization.test.js` passed all 18 new checks; the complete `npm test` suite passed all 143 tests with zero failures/skips. `npm.cmd run content:check` passed all 32 PDF/source consistency checks, confirmed all 10 data files unchanged, reported databaseModified false and kept importApproved false. Existing Mongoose deprecation warnings for older `new: true` calls remain; the new ownership update helper uses returnDocument instead. No live Atlas/browser/provider operation was performed.

authorization.test.js creates a generic AuthorizationFixture model and router only inside its disposable local replica-set test server. It is not a bookmark/personal-note feature, is never imported by the production app, and its routes are explicitly checked to return 404 on the real app. Real database tests prove owner constraints, scoped queries/mutations, unchanged foreign records, spoofed-ID rejection, role/verification gates, password-change/deactivation revocation, safe errors and canonical read-only behavior. No existing test was removed or weakened.

Created:

- backend/src/utils/authorization.js
- backend/src/models/privateOwner.js
- backend/src/services/ownedResource.service.js
- backend/tests/authorization.test.js
- backend/docs/AUTHORIZATION.md

Modified:

- backend/src/middleware/auth.middleware.js: projected authenticated identity, shared active/authenticated guard, role gate and existing verified-email guard composition.
- backend/docs/AUTHENTICATION.md: link the current authorization/ownership contract.

No frontend file changed, so frontend tests/build are not required by this backend-only task. No new production collection/index exists; the private-owner index will be initialized only when a future actual resource is implemented. Existing auth initialization and mail/refresh deployment limitations from Tasks 3–5 remain unchanged.
