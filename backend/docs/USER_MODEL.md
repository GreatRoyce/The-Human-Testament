# User identity model

`src/models/User.js` follows the backend's CommonJS/Mongoose model pattern. It stores only account identity: normalized email, a bcrypt hash, display name, role, verification/activity flags, optional password-change date, and automatic timestamps. No routes, registration/login workflow, real accounts, manuscript changes, recovery tokens, sessions, or dependencies are added.

- Email is trimmed and lowercased, with a practical ASCII mailbox syntax check (254 characters total; 64 for the local part). Dots and plus tags are preserved. Syntax validation does not establish deliverability or ownership; internationalized/quoted email syntax is not supported in this initial model.
- Display names are trimmed, 1–80 characters, support Unicode, and reject control characters.
- Only `role: user` is enabled. Administrative role values are rejected even when supplied directly to the model. A future privileged provisioning process must be separately authorized before adding them. Future account services must also explicitly allowlist input fields rather than mass-assigning verification/activity flags.
- `passwordHash` accepts bcrypt representations supported by the installed `bcryptjs`, with cost 10–31. The model never hashes plaintext implicitly and does not perform login verification. A trusted future password service must generate hashes with `bcryptjs.hash()` and verify them with `bcryptjs.compare()`, enforce password policy and bcrypt's 72-byte input limit, and record `passwordChangedAt` on changes/resets. Hash shape/cost validation cannot prove how a supplied hash was generated.
- `select: false` hides the hash in ordinary hydrated and lean queries. `toJSON` and `toObject` remove it even when explicitly selected. Future credential checks can use `.select('+passwordHash')`; deliberately selecting it into a lean object, disabling transforms, aggregation, or raw driver access bypasses serialization safeguards and must never be returned directly as an API response.
- Strict mode rejects unknown fields, including plaintext passwords, recovery tokens and session secrets. Recovery credentials and refresh sessions belong in separate future models. Mongoose query updates must use `runValidators: true`; direct database writes bypass model validators.

## Database initialization

Automatic collection/index creation is disabled, matching existing models. Before accepting accounts in a target database, a controlled initialization step must load the User model and run:

```js
await User.createCollection();
await User.createIndexes();
```

The named `user_email_unique` index is unique on `email`, with English collation strength 2 (case insensitive). The schema sets the same default collation for queries and new collection creation. Normalization runs on model assignments and query updates; the index also rejects case variants from other clients. Uniqueness is enforced by MongoDB, not by `validate()`.

No Atlas initialization is performed by this task. For a new collection, no data migration is required. If a `users` collection already exists, audit and normalize existing email values and resolve case-equivalent duplicates before creating this index. An existing collection's default collation is not changed by `createCollection()`; schema queries and this index still specify their collation. Review conflicting existing indexes explicitly; do not use `syncIndexes()` to drop indexes blindly.

## Tests

Run from `backend/`:

```powershell
node --test tests/user-model.test.js
npm.cmd test
```

Tests use synthetic identities, the existing Node test runner and a disposable loopback MongoDB instance. They never load `.env`, use Atlas credentials, or create a real user account. Real index enforcement, timestamps, updates and default/explicit credential projections are exercised alongside schema validation.
