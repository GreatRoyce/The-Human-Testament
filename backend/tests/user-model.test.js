// Account fixtures only. Never load .env, use MONGODB_URI, or seed a real user.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');

const password = 'Synthetic test password only!';
let passwordHash;
before(async () => { passwordHash = await bcrypt.hash(password, 10); });
const fixture = overrides => ({ email: 'reader@example.test', displayName: 'Test Reader', passwordHash, ...overrides });
async function rejectsField(field, value) {
  await assert.rejects(new User(fixture({ [field]: value })).validate(), error =>
    error.name === 'ValidationError' && Boolean(error.errors[field]));
}

test('valid account identity accepts a bcryptjs hash and preserves it without rehashing', async () => {
  const user = new User(fixture());
  await user.validate();
  assert.equal(user.passwordHash, passwordHash);
  assert.equal(await bcrypt.compare(password, user.passwordHash), true);
  assert.equal(await bcrypt.compare('wrong synthetic password', user.passwordHash), false);
});

test('email is trimmed and lowercased while dots and plus tags retain their meaning', async () => {
  const user = new User(fixture({ email: '  Reader.Name+Book@Example.TEST  ' }));
  await user.validate();
  assert.equal(user.email, 'reader.name+book@example.test');
  user.email = ' UPDATED@Example.TEST ';
  await user.validate();
  assert.equal(user.email, 'updated@example.test');
});

test('email, passwordHash and displayName are required', async () => {
  for (const field of ['email', 'passwordHash', 'displayName']) {
    for (const value of [undefined, null, '']) await rejectsField(field, value);
  }
});

test('invalid email syntax, excessive lengths, and implicit nonstring casting are rejected', async () => {
  for (const email of ['not-an-email', 'reader@', '@example.test', 'reader@@example.test', 'reader@example',
    'read er@example.test', 'reader@exam ple.test', 'reader..name@example.test', '.reader@example.test',
    'reader.@example.test', 'reader@-example.test', 'reader@example-.test', 'reader@example..test',
    'reader\nname@example.test', 'a'.repeat(65) + '@example.test', 'a@' + 'b'.repeat(64) + '.test',
    'a'.repeat(64) + '@' + ['b'.repeat(63), 'c'.repeat(63), 'd'.repeat(63), 'test'].join('.'), 123, {}]) {
    await rejectsField('email', email);
  }
});

test('display names are trimmed, accept Unicode, and have limits of 1 to 80 characters', async () => {
  const user = new User(fixture({ displayName: '  Chukwudi Okoh  ' }));
  await user.validate(); assert.equal(user.displayName, 'Chukwudi Okoh');
  for (const displayName of ['李', 'Élodie', 'a'.repeat(80)]) await new User(fixture({ displayName })).validate();
  for (const displayName of ['   ', 'a'.repeat(81), 'Reader\nName', 'Reader\u0000Name', 123, {}]) {
    await rejectsField('displayName', displayName);
  }
});

test('only the user role is available; ordinary account input cannot request administrative roles', async () => {
  for (const role of ['admin', 'owner', 'moderator', 'superadmin', 'USER', '', null, 123]) await rejectsField('role', role);
});

test('account defaults are safe and passwordChangedAt is optional', async () => {
  const user = new User(fixture()); await user.validate();
  assert.equal(user.role, 'user'); assert.equal(user.emailVerified, false); assert.equal(user.isActive, true);
  assert.equal(user.passwordChangedAt, undefined);
  const changedAt = new Date('2026-01-01T00:00:00.000Z');
  const changed = new User(fixture({ passwordChangedAt: changedAt, emailVerified: true, isActive: false }));
  await changed.validate(); assert.equal(changed.passwordChangedAt.getTime(), changedAt.getTime());
  assert.equal(changed.emailVerified, true); assert.equal(changed.isActive, false);
  await rejectsField('passwordChangedAt', 'invalid-date');
});

test('plaintext, malformed or low-cost hashes are rejected rather than implicitly hashed', async () => {
  for (const value of [password, 'plaintext', 'a'.repeat(60), passwordHash.slice(1),
    passwordHash.replace('$2b$', '$argon2$'), passwordHash.replace('$10$', '$04$'),
    passwordHash.replace('$10$', '$32$'), ' ' + passwordHash, passwordHash + ' ',
    passwordHash + '\n', passwordHash + '\r\n', 123]) {
    await rejectsField('passwordHash', value);
  }
});

test('passwordHash is excluded from default queries and ordinary object/JSON serialization', async () => {
  const user = new User(fixture()); await user.validate();
  assert.equal(User.schema.path('passwordHash').options.select, false);
  for (const value of [user.toJSON(), user.toObject(), JSON.parse(JSON.stringify(user))]) {
    assert.equal('passwordHash' in value, false);
    assert.equal(value.email, user.email); assert.equal(value.displayName, user.displayName);
    assert.equal(JSON.stringify(value).includes(passwordHash), false);
    assert.equal(JSON.stringify(value).includes(password), false);
  }
});

test('unknown plaintext, recovery and session fields cannot be stored through the model', () => {
  for (const field of ['password', 'passwordResetToken', 'resetTokenHash', 'refreshToken', 'sessionSecret']) {
    assert.equal(User.schema.path(field), undefined);
    assert.throws(() => new User(fixture({ [field]: 'must not persist' })), { name: 'StrictModeError' });
  }
  assert.equal(User.schema.options.autoCreate, false);
  assert.equal(User.schema.options.autoIndex, false);
});

test('real MongoDB enforces normalized email uniqueness, timestamps and credential projection', { timeout: 1800000 }, async t => {
  const memory = await MongoMemoryServer.create({ instance: { dbName: 'human_testament_user_model_test' } });
  const uri = memory.getUri(); assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
  try {
    await mongoose.connect(uri, { dbName: 'human_testament_user_model_test', autoCreate: false, autoIndex: false });
    // Deliberate initialization follows the existing persistence-test convention.
    await User.createCollection(); await User.createIndexes();
    const user = await User.create(fixture({ email: '  READER@Example.TEST  ' }));

    await t.test('creation stores a normalized address, a usable hash, defaults and automatic timestamps', async () => {
      const stored = await User.findById(user._id).select('+passwordHash');
      assert.equal(stored.email, 'reader@example.test'); assert.equal(stored.passwordHash, passwordHash);
      assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
      assert.equal(stored.role, 'user'); assert.equal(stored.emailVerified, false); assert.equal(stored.isActive, true);
      assert.equal(stored.passwordChangedAt, undefined);
      assert.ok(stored.createdAt instanceof Date); assert.ok(stored.updatedAt instanceof Date);
      assert.equal(stored.createdAt.getTime(), stored.updatedAt.getTime());
      assert.equal(stored.createdAt.getTime(), user.createdAt.getTime());
    });

    await t.test('the unique database index rejects both exact duplicates and normalized case variations', async () => {
      const index = (await User.collection.indexes()).find(index => index.name === 'user_email_unique');
      assert.deepEqual(index.key, { email: 1 }); assert.equal(index.unique, true); assert.equal(index.collation.strength, 2);
      for (const email of ['reader@example.test', 'READER@example.TEST', ' Reader@Example.Test ']) {
        // Demonstrates that validation succeeds; the database enforces uniqueness.
        await new User(fixture({ email })).validate();
        await assert.rejects(User.create(fixture({ email })), error => error.code === 11000);
      }
      // Case-insensitive uniqueness still holds for writes bypassing Mongoose setters.
      await assert.rejects(User.collection.insertOne(fixture({ email: 'Reader@Example.Test' })), error => error.code === 11000);
      assert.equal(await User.countDocuments(), 1);
    });

    await t.test('changing an email through a validated update also normalizes it and cannot bypass uniqueness', async () => {
      const second = await User.create(fixture({ email: 'second@example.test' }));
      await assert.rejects(User.updateOne({ _id: second._id }, { $set: { email: ' READER@EXAMPLE.TEST ' } }, { runValidators: true }), error => error.code === 11000);
      await User.updateOne({ _id: second._id }, { $set: { email: ' RENAMED@EXAMPLE.TEST ' } }, { runValidators: true });
      assert.equal((await User.collection.findOne({ _id: second._id })).email, 'renamed@example.test');
      await assert.rejects(User.updateOne({ _id: second._id }, { $set: { passwordHash: password } }, { runValidators: true }), error => error.name === 'ValidationError');
      await assert.rejects(User.updateOne({ _id: second._id }, { $set: { role: 'admin' } }, { runValidators: true }), error => error.name === 'ValidationError');
    });

    await t.test('timestamps are maintained on saves and query updates', async () => {
      const originalCreatedAt = user.createdAt.getTime();
      user.displayName = 'Updated Reader';
      // A deterministic future clock avoids sleeps and same-millisecond assertions.
      let now = new Date(user.updatedAt.getTime() + 1000);
      t.mock.method(mongoose, 'now', () => now);
      await user.save();
      assert.equal(user.createdAt.getTime(), originalCreatedAt); assert.equal(user.updatedAt.getTime(), now.getTime());
      now = new Date(now.getTime() + 1000);
      await User.updateOne({ _id: user._id }, { $set: { displayName: 'Reader Again' } }, { runValidators: true });
      const stored = await User.findById(user._id);
      assert.equal(stored.createdAt.getTime(), originalCreatedAt); assert.equal(stored.updatedAt.getTime(), now.getTime());
      assert.equal(stored.passwordChangedAt, undefined);
    });

    await t.test('default hydrated and lean reads hide the hash, including after an unrelated save', async () => {
      const stored = await User.findOne({ email: 'READER@EXAMPLE.TEST' });
      assert.ok(stored); assert.equal(stored.passwordHash, undefined);
      assert.equal('passwordHash' in await User.findById(user._id).lean(), false);
      stored.displayName = 'No Credential Rewrite'; await stored.save();
      assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, passwordHash);
      const selected = await User.findById(user._id).select('+passwordHash');
      for (const value of [selected.toJSON(), selected.toObject(), JSON.parse(JSON.stringify(selected))]) assert.equal('passwordHash' in value, false);
    });
  } finally { await mongoose.disconnect(); await memory.stop(); }
});
