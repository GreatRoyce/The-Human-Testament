// Disposable loopback MongoDB only. No .env, Atlas, real identities or mail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production';
process.env.CONTENT_SOURCE = 'pdf';
process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.MAIL_DELIVERY_ENABLED = 'false';
delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
delete process.env.AUTH_COOKIE_SAME_SITE;
const app = require('../src/app');
const User = require('../src/models/User');
const Bookmark = require('../src/models/Bookmark');
const PrivateNote = require('../src/models/PrivateNote');
const Session = require('../src/models/RefreshSession');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { createSession } = require('../src/services/session.service');
const { getAuthConfig } = require('../src/config/auth');
const library = require('../src/services/personalLibrary.service');
const manuscript = require('../../shared/manuscript.json');
const canonicalHash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');
const verseId = 'freedom:10:14', otherVerse = 'inquiry:1:1';
const password = 'Synthetic personal library passphrase!';
const origin = process.env.AUTH_ALLOWED_ORIGINS;

test('saved verses and private notes remain owned, persistent and separate from the manuscript', { timeout: 1800000 }, async t => {
  const beforeHash = canonicalHash();
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
  let server, sequence = 0;
  try {
    await mongoose.connect(memory.getUri(), { dbName: 'human_testament_personal_library_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage();
    const passwordHash = await bcrypt.hash(password, 12);
    const alice = await User.create({ email: 'alice-library@example.test', displayName: 'Alice', passwordHash });
    const bob = await User.create({ email: 'bob-library@example.test', displayName: 'Bob', passwordHash });
    const accessFor = async user => (await createSession(await User.findById(user._id).select('+passwordHash'), getAuthConfig())).accessToken;
    const aliceToken = await accessFor(alice), bobToken = await accessFor(bob);
    app.set('trust proxy', 1);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(path, { token = aliceToken, method = 'GET', body, headers = {}, ip } = {}) {
      const result = await fetch(base + path, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: origin, 'X-CSRF-Protection': '1', 'Content-Type': 'application/json',
        'X-Forwarded-For': ip ?? `198.51.100.${++sequence % 250 + 1}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: result.status, body: await result.json(), headers: result.headers };
    }
    const save = (id = verseId, options = {}) => request('/api/bookmarks', { method: 'POST', body: { verseId: id }, ...options });
    const createNote = (content = 'Private library test note', options = {}) => request('/api/notes', { method: 'POST', body: { verseId, content }, ...options });
    const publicPaths = ['/api/verses/' + verseId, '/api/books/freedom/chapters/10', '/api/books/freedom/chapters/10/verses/14/supporting-material'];
    const publicBefore = await Promise.all(publicPaths.map(path => request(path, { token: null })));
    let noteId;

    await t.test('models validate canonical identity, immutable ownership, exact note text and timestamps', async () => {
      for (const Model of [Bookmark, PrivateNote]) {
        assert.equal(Model.schema.path('user').options.immutable, true);
        assert.equal(Model.schema.path('verseId').options.immutable, true);
        await assert.rejects(new Model({ verseId, ...(Model === PrivateNote ? { content: 'Note' } : {}) }).validate(), /user/);
        await assert.rejects(new Model({ user: alice._id, verseId: 'unknown:1:1', ...(Model === PrivateNote ? { content: 'Note' } : {}) }).validate(), /Canonical verse/);
        assert.throws(() => new Model({ user: alice._id, verseId, text: 'Never copy canonical text' }), /strict mode/);
      }
      const result = await createNote('  Original\n\t<script>alert("plain text")</script> 漢字  ');
      assert.equal(result.status, 201); noteId = result.body.data.item.id;
      const item = result.body.data.item;
      assert.equal(item.content, '  Original\n\t<script>alert("plain text")</script> 漢字  ');
      assert.equal(item.verseId, verseId); assert.ok(Date.parse(item.createdAt)); assert.ok(Date.parse(item.updatedAt));
      assert.deepEqual(Object.keys(item).sort(), ['content', 'createdAt', 'id', 'updatedAt', 'verseId']);
      const stored = await PrivateNote.findById(noteId).lean();
      assert.equal(String(stored.user), String(alice._id)); assert.equal(stored.text, undefined);
    });
    await t.test('bookmark saves are idempotent and a real unique index arbitrates concurrent creation', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => save()));
      assert.equal(results.filter(result => result.status === 201).length, 1);
      assert.equal(results.filter(result => result.status === 200).length, 11);
      assert.equal(new Set(results.map(result => result.body.data.item.id)).size, 1);
      assert.equal(await Bookmark.countDocuments({ user: alice._id, verseId }), 1);
      await assert.rejects(Bookmark.collection.insertOne({ user: alice._id, verseId, createdAt: new Date() }), error => error.code === 11000);
      assert.equal((await save(verseId, { token: bobToken })).status, 201);
      const result = await request('/api/bookmarks'); assert.equal(result.status, 200);
      assert.equal(result.body.data.pagination.total, 1); assert.equal(result.body.data.items[0].verseId, verseId);
      assert.deepEqual(Object.keys(result.body.data.items[0]).sort(), ['createdAt', 'id', 'verseId']);
    });
    await t.test('nonexistent books, chapters, verses, malformed IDs and aliases never create canonical records', async () => {
      for (const id of ['unknown:1:1', 'freedom:999:1', 'freedom:10:999', 'freedom:010:14', 'Freedom:10:14', 'freedom:10:14 ', '', 'freedom/10/14']) {
        assert.equal((await save(id)).status, 404);
        assert.equal((await createNote('Denied', { body: { verseId: id, content: 'Denied' } })).status, 404);
      }
      const unresolved = manuscript.unresolvedReferences[0];
      // The corpus's unresolved slots remain valid references without invented text.
      const id = typeof unresolved === 'string' ? unresolved : unresolved.canonicalId;
      assert.ok(id, JSON.stringify(unresolved));
      assert.equal((await save(id)).status, 201);
      assert.equal((await request('/api/verses/' + id, { token: null })).body.data.text, undefined);
    });
    await t.test('list pagination is bounded, deterministic and optionally filtered by exact verse ID', async () => {
      await save(otherVerse);
      await createNote('Second note on the same verse'); await createNote('Third note on the same verse');
      const first = await request('/api/notes?limit=1&page=1&verseId=' + verseId);
      const second = await request('/api/notes?limit=1&page=2&verseId=' + verseId);
      assert.equal(first.status, 200); assert.equal(first.body.data.pagination.total, 3);
      assert.equal(first.body.data.pagination.pages, 3); assert.notEqual(first.body.data.items[0].id, second.body.data.items[0].id);
      assert.equal((await request('/api/bookmarks?verseId=' + otherVerse)).body.data.items.length, 1);
      for (const query of ['limit=0', 'limit=51', 'page=10001', 'page=1.5', 'page=01', 'page[$gt]=0', 'verseId[$ne]=x', 'limit=1&limit=2', 'sort=user', 'userId=' + bob._id])
        assert.equal((await request('/api/notes?' + query)).status, 400, query);
      assert.equal((await request('/api/bookmarks?verseId=unknown:1:1')).status, 404);
    });
    await t.test('one user cannot read, update or delete another user\'s note or enumerate existence', async () => {
      assert.equal((await request('/api/notes', { token: bobToken })).body.data.pagination.total, 0);
      const missing = String(new mongoose.Types.ObjectId());
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        const responses = [];
        for (const id of [noteId, missing, 'invalid']) {
          const result = await request('/api/notes/' + id, { token: bobToken, method, ...(method === 'PATCH' ? { body: { content: 'Denied' } } : method === 'DELETE' ? { body: {} } : {}) });
          assert.equal(result.status, 404); responses.push(result.body);
        }
        assert.deepEqual(responses[0], responses[1]); assert.deepEqual(responses[0], responses[2]);
      }
      assert.ok((await PrivateNote.findById(noteId)).content.startsWith('  Original'));
      const bobList = await request('/api/bookmarks', { token: bobToken });
      assert.equal(bobList.body.data.pagination.total, 1); // Own shared reference, never Alice's other saves.
      assert.equal((await request('/api/bookmarks/' + otherVerse, { method: 'DELETE', token: bobToken, body: {} })).status, 404);
      assert.ok(await Bookmark.exists({ user: alice._id, verseId: otherVerse }));
    });
    await t.test('every endpoint rejects anonymous access and forged authorization', async () => {
      for (const token of [null, 'invalid']) for (const [method, path, body] of [
        ['GET', '/api/bookmarks'], ['POST', '/api/bookmarks', { verseId }], ['DELETE', '/api/bookmarks/' + verseId, {}],
        ['GET', '/api/notes'], ['POST', '/api/notes', { verseId, content: 'Denied' }], ['GET', '/api/notes/' + noteId],
        ['PATCH', '/api/notes/' + noteId, { content: 'Denied' }], ['DELETE', '/api/notes/' + noteId, {}],
      ]) {
        const result = await request(path, { method, body, token }); assert.equal(result.status, 401, method + path);
        assert.equal(result.headers.get('cache-control'), 'no-store');
      }
    });
    await t.test('body, query, header, operator and immutable-reference injection cannot transfer ownership', async () => {
      for (const field of ['user', 'userId', 'owner', 'ownerId', '_id', 'createdAt', '__v', '$set', 'user.id', 'text']) {
        assert.equal((await save(verseId, { body: { verseId, [field]: String(bob._id) } })).status, 400);
        assert.equal((await createNote('Denied', { body: { verseId, content: 'Denied', [field]: String(bob._id) } })).status, 400);
        assert.equal((await request('/api/notes/' + noteId, { method: 'PATCH', body: { content: 'Denied', [field]: String(bob._id) } })).status, 400);
        assert.equal((await request('/api/notes/' + noteId, { method: 'DELETE', body: { [field]: String(bob._id) } })).status, 400);
      }
      assert.equal((await request('/api/notes/' + noteId, { method: 'PATCH', body: { content: 'Denied', verseId: otherVerse } })).status, 400);
      for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await request('/api/notes/' + noteId + '?userId=' + bob._id, {
        method, ...(method === 'PATCH' ? { body: { content: 'Denied' } } : method === 'DELETE' ? { body: {} } : {}),
      })).status, 400);
      const own = await request('/api/notes/' + noteId, { headers: { 'X-User-Id': String(bob._id) } });
      assert.equal(own.status, 200); assert.ok(own.body.data.item.content.startsWith('  Original'));
    });
    await t.test('empty, blank, nonstring and oversized note content is rejected on create and edit', async () => {
      for (const content of ['', ' \n\t ', 'x'.repeat(5001), null, 42, [], { $ne: '' }]) {
        assert.equal((await createNote(content)).status, 400);
        assert.equal((await request('/api/notes/' + noteId, { method: 'PATCH', body: { content } })).status, 400);
      }
      for (const body of [{}, [], null, { verseId }]) assert.equal((await createNote('Ignored', { body })).status, 400);
      assert.equal((await createNote('x'.repeat(5000))).status, 201);
    });
    await t.test('own note can be retrieved, edited exactly and deleted without changing its reference or creation date', async () => {
      const before = (await request('/api/notes/' + noteId)).body.data.item;
      const content = '  Edited\r\n\twith exact spacing 😀  ';
      const updated = await request('/api/notes/' + noteId, { method: 'PATCH', body: { content } });
      assert.equal(updated.status, 200); assert.equal(updated.body.data.item.content, content);
      assert.equal(updated.body.data.item.verseId, verseId); assert.equal(updated.body.data.item.createdAt, before.createdAt);
      assert.ok(Date.parse(updated.body.data.item.updatedAt) >= Date.parse(before.updatedAt));
      assert.equal((await request('/api/notes/' + noteId)).body.data.item.content, content);
      assert.equal((await request('/api/notes/' + noteId, { method: 'DELETE', body: {} })).status, 200);
      assert.equal((await request('/api/notes/' + noteId)).status, 404);
      assert.equal(await PrivateNote.exists({ _id: noteId }), null);
    });
    await t.test('bookmark removal affects only the current user, survives reloads and has no redundant lookup route', async () => {
      assert.equal((await request('/api/bookmarks/' + verseId)).status, 404);
      assert.equal((await request('/api/bookmarks/' + verseId, { method: 'DELETE', body: {} })).status, 200);
      assert.equal((await request('/api/bookmarks/' + verseId, { method: 'DELETE', body: {} })).status, 404);
      assert.equal(await Bookmark.countDocuments({ user: alice._id, verseId }), 0);
      assert.equal(await Bookmark.countDocuments({ user: bob._id, verseId }), 1);
      assert.equal((await request('/api/bookmarks?verseId=' + verseId)).body.data.items.length, 0);
    });
    await t.test('separate authenticated sessions retrieve persisted records and revoked sessions lose access', async () => {
      const secondToken = await accessFor(alice);
      const before = await request('/api/notes'), after = await request('/api/notes', { token: secondToken });
      assert.deepEqual(after.body, before.body);
      await Session.updateMany({ user: alice._id }, { $set: { revokedAt: new Date() } });
      assert.equal((await request('/api/bookmarks', { token: secondToken })).status, 401);
      assert.equal((await save(verseId, { token: secondToken })).status, 401);
      assert.equal((await request('/api/notes', { token: await accessFor(alice) })).body.data.pagination.total, before.body.data.pagination.total);
    });
    await t.test('real frontend services create/list/edit/remove through the mounted API without exposing credentials', async () => {
      const { createApiClient } = await import('../../frontend/src/services/api/client.js');
      const { createAuthService } = await import('../../frontend/src/services/auth.service.js');
      const { createBookmarksService } = await import('../../frontend/src/services/bookmarks.service.js');
      const { createNotesService } = await import('../../frontend/src/services/notes.service.js');
      const client = createApiClient({ baseUrl: base, fetchImpl: (url, init) => fetch(url, { ...init, headers: { ...init.headers, Origin: origin } }) });
      const auth = createAuthService(client), bookmarks = createBookmarksService(auth), notes = createNotesService(auth);
      await assert.rejects(bookmarks.list(), { status: 401 });
      assert.equal((await auth.login({ email: bob.email, password })).accessToken, undefined);
      await bookmarks.save(otherVerse); assert.equal((await bookmarks.list({ verseId: otherVerse })).items.length, 1);
      const note = await notes.create({ verseId: otherVerse, content: '  frontend\ntext  ' });
      assert.equal((await notes.get(note.id)).content, note.content);
      assert.equal((await notes.update(note.id, { content: '  changed  ' })).content, '  changed  ');
      assert.equal((await notes.list()).items.length, 1);
      await notes.remove(note.id); await bookmarks.remove(otherVerse);
      assert.equal((await notes.list()).items.length, 0);
      await auth.logout(); await assert.rejects(notes.list(), { status: 401 });
    });
    await t.test('private endpoints enforce origin/CSRF/media checks and trusted credentialed CORS', async () => {
      const token = await accessFor(bob);
      for (const headers of [{ Origin: 'https://attacker.test' }, { 'X-CSRF-Protection': '' }])
        assert.equal((await save(verseId, { token, headers })).status, 403);
      assert.equal((await save(verseId, { token, headers: { 'Content-Type': 'text/plain' } })).status, 415);
      for (const path of ['/api/bookmarks', '/api/notes']) {
        const result = await fetch(base + path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'Authorization,Content-Type,X-CSRF-Protection' } });
        assert.equal(result.status, 204); assert.equal(result.headers.get('access-control-allow-origin'), origin);
        assert.equal(result.headers.get('access-control-allow-credentials'), 'true'); assert.match(result.headers.get('access-control-allow-methods'), /DELETE/);
        const denied = await request(path, { token, headers: { Origin: 'https://attacker.test' } });
        assert.equal(denied.headers.get('access-control-allow-origin'), null); assert.equal(denied.headers.get('cache-control'), 'no-store');
      }
    });
    await t.test('missing required unique index fails closed until explicit initialization repairs it', async () => {
      const token = await accessFor(bob);
      await Bookmark.collection.dropIndex('bookmark_user_verse_unique');
      assert.equal((await save(verseId, { token })).status, 503);
      assert.equal((await request('/api/notes', { token })).status, 503);
      assert.equal((await request('/api/auth/me', { token })).status, 200);
      assert.equal((await request('/api/verses/' + verseId, { token: null })).status, 200);
      await initializeAuthStorage(); assert.equal((await save(verseId, { token })).status, 200);
    });
    await t.test('all public manuscript responses and the shared source remain unchanged; no canonical Mongo collections appear', async () => {
      const after = await Promise.all(publicPaths.map(path => request(path, { token: null })));
      assert.deepEqual(after.map(result => result.body), publicBefore.map(result => result.body));
      assert.equal(canonicalHash(), beforeHash);
      const collections = (await mongoose.connection.db.listCollections().toArray()).map(item => item.name);
      for (const name of ['books', 'chapters', 'verses', 'notes', 'editions']) assert.equal(collections.includes(name), false);
      assert.ok(collections.includes('bookmarks')); assert.ok(collections.includes('privatenotes'));
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});

test('private library services reject untrusted authentication before database access', async () => {
  for (const auth of [undefined, {}, { user: { _id: new mongoose.Types.ObjectId(), isActive: true } }]) {
    for (const action of [() => library.listBookmarks(auth), () => library.listNotes(auth), () => library.saveBookmark(auth, { verseId }),
      () => library.removeBookmark(auth, verseId, {}), () => library.createNote(auth, { verseId, content: 'Denied' }),
      () => library.getNote(auth, 'bad'), () => library.updateNote(auth, 'bad', { content: 'Denied' }), () => library.deleteNote(auth, 'bad', {})])
      await assert.rejects(action(), { status: 401 });
  }
});
