const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production'; process.env.CONTENT_SOURCE = 'pdf'; process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url'); process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test';
process.env.COMMUNITY_POSTING_ENABLED = 'true'; process.env.MAIL_DELIVERY_ENABLED = 'false'; delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
const app = require('../src/app');
const User = require('../src/models/User'), Notification = require('../src/models/Notification');
const Discussion = require('../src/models/Discussion'), Comment = require('../src/models/Comment');
const Membership = require('../src/models/CircleMembership'), Circle = require('../src/models/ReadingCircle');
const Article = require('../src/models/Article'), Audit = require('../src/models/ModerationAction');
const Moderator = require('../src/models/CommunityModerator');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { initializeCommunityStorage } = require('../src/services/communityStorage');
const { initializeArticleStorage } = require('../src/services/articleStorage');
const { assertNotificationStorage } = require('../src/services/notificationStorage');
const { emitNotification } = require('../src/services/notificationEvents.service');
const service = require('../src/services/notification.service');
const { createSession } = require('../src/services/session.service');
const { getAuthConfig } = require('../src/config/auth');
const email = require('../src/services/email.service');
const canonicalHash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');
test('notifications remain owned, idempotent, private and separate from content and delivery', { timeout: 1800000 }, async t => {
  const before = canonicalHash(), memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let server;
  try {
    assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(memory.getUri(), { dbName: 'notifications_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage(); await initializeCommunityStorage(); await initializeArticleStorage();
    const passwordHash = await bcrypt.hash('Synthetic notification passphrase!', 12), users = {}, tokens = {};
    for (const name of ['alice', 'bob', 'moderator', 'outsider', 'inactive']) {
      users[name] = await User.create({ email: `${name}@example.test`, displayName: name === 'bob' ? '<script>reader</script>' : name, passwordHash, emailVerified: true, isActive: name !== 'inactive' });
      if (name !== 'inactive') tokens[name] = (await createSession(await User.findById(users[name]._id).select('+passwordHash'), getAuthConfig())).accessToken;
    }
    await Moderator.create({ user: users.moderator._id, grantedBy: 'synthetic-test-operator', reason: 'Disposable fixture' });
    app.set('trust proxy', 1); let sequence = 0;
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    async function request(path, { method = 'GET', body, user = 'alice', headers = {} } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: process.env.AUTH_ALLOWED_ORIGINS, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1',
        'X-Forwarded-For': `198.20.${Math.floor(++sequence / 250)}.${sequence % 250 + 1}`,
        ...(user ? { Authorization: 'Bearer ' + (tokens[user] ?? user) } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    }
    const post = (path, body, user = 'alice') => request(path, { method: 'POST', body, user });
    const patch = (path, body, user = 'alice') => request(path, { method: 'PATCH', body, user });
    const inbox = async (user = 'alice', query = '') => request('/api/notifications' + query, { user });
    const unread = async (user = 'alice') => (await request('/api/notifications/unread-count', { user })).body.data.unreadCount;
    const draft = async (user = 'alice') => (await post('/api/articles', { title: 'Private article title', body: 'Private article body secret' }, user)).body.data.item;
    const review = async (id, action) => {
      const row = (await request('/api/articles/moderation/' + id, { user: 'moderator' })).body.data.item;
      return post(`/api/articles/${id}/review`, { action, reason: 'Private review explanation', expectedRevision: row.revision }, 'moderator');
    };
    const discussion = (await post('/api/discussions', { title: 'Discussion title secret', body: 'Discussion prose secret' })).body.data.item;
    const commentOn = (id, user = 'bob') => post(`/api/discussions/${id}/comments`, { body: 'Comment prose secret' }, user);
    let comment, firstNotice, privateCircle, privateDiscussion, article;
    await t.test('supported comment events create exactly one notice and self-actions do not', async () => {
      assert.equal((await commentOn(discussion.id, 'alice')).status, 201); assert.equal(await unread(), 0);
      const result = await commentOn(discussion.id); assert.equal(result.status, 201); comment = result.body.data.item;
      const response = await inbox(); assert.equal(response.status, 200, JSON.stringify(response.body)); firstNotice = response.body.data.items[0];
      assert.equal(firstNotice.type, 'discussion_comment'); assert.equal(firstNotice.message, Notification.messages.discussion_comment);
      assert.equal(firstNotice.actor.id, String(users.bob._id)); assert.equal(firstNotice.targetUrl, '/community/discussions/' + discussion.id);
      assert.equal(firstNotice.readAt, null); assert.ok(Date.parse(firstNotice.createdAt)); assert.equal(await unread(), 1);
      assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(await unread('bob'), 0);
    });
    await t.test('durable event replay is unique, preserves timestamps/read state and validates the real recipient', async () => {
      const event = { recipient: users.alice._id, actor: users.bob._id, type: 'discussion_comment', resourceType: 'comment', resourceId: comment.id, eventKey: `comment:${comment.id}` };
      await mongoose.connection.transaction(session => emitNotification(event, session));
      assert.equal(await Notification.countDocuments({ recipient: users.alice._id }), 1);
      assert.equal((await inbox()).body.data.items[0].createdAt, firstNotice.createdAt);
      await mongoose.connection.transaction(session => emitNotification({ ...event, recipient: users.outsider._id }, session));
      assert.equal(await unread('outsider'), 0);
      await assert.rejects(emitNotification(event), /transaction/);
      await assert.rejects(Notification.collection.insertOne({ recipient: users.alice._id, eventKey: event.eventKey }), error => error.code === 11000);
    });
    await t.test('list, counts and pagination are owner scoped, bounded and deterministic', async () => {
      await commentOn(discussion.id); await commentOn(discussion.id);
      const first = await inbox('alice', '?limit=1'), second = await inbox('alice', '?page=2&limit=1');
      assert.equal(first.body.data.pagination.total, 3); assert.equal(first.body.data.pagination.pages, 3); assert.notEqual(first.body.data.items[0].id, second.body.data.items[0].id);
      assert.equal(await unread(), 3); assert.equal((await inbox('outsider')).body.data.pagination.total, 0);
      for (const query of ['limit=0', 'limit=51', 'page=01', 'page=10001', 'page=1&limit=1&limit=2', 'recipient=' + users.bob._id, 'readAt[$ne]=null', 'type=discussion_comment']) assert.equal((await inbox('alice', '?' + query)).status, 400, query);
      for (const token of [null, 'invalid-token']) for (const [method, path, body] of [
        ['GET', '/api/notifications'], ['GET', '/api/notifications/unread-count'], ['PATCH', `/api/notifications/${firstNotice.id}/read`, {}], ['POST', '/api/notifications/read-all', {}],
      ]) assert.equal((await request(path, { method, body, user: token })).status, 401, path);
    });
    await t.test('read-one and read-all are atomic, idempotent and reject foreign IDs and client recipients', async () => {
      const result = await patch(`/api/notifications/${firstNotice.id}/read`, {}); assert.equal(result.status, 200);
      const at = result.body.data.item.readAt; assert.ok(Date.parse(at)); assert.equal(await unread(), 2);
      assert.equal((await patch(`/api/notifications/${firstNotice.id}/read`, {})).body.data.item.readAt, at);
      for (const id of [firstNotice.id, String(new mongoose.Types.ObjectId()), 'invalid']) assert.equal((await patch(`/api/notifications/${id}/read`, {}, 'outsider')).status, 404);
      for (const body of [{ recipient: String(users.bob._id) }, { readAt: '2026-01-01' }, { $set: { readAt: null } }]) {
        assert.equal((await patch(`/api/notifications/${firstNotice.id}/read`, body)).status, 400); assert.equal((await post('/api/notifications/read-all', body)).status, 400);
      }
      assert.equal((await post('/api/notifications', { recipient: String(users.bob._id), message: 'Spoof' })).status, 404);
      assert.equal((await patch(`/api/notifications/${firstNotice.id}/read`, {}, 'alice')).headers.get('cache-control'), 'no-store');
      assert.equal((await request('/api/notifications/read-all', { method: 'POST', body: {}, headers: { Origin: 'https://attacker.test' } })).status, 403);
      assert.equal((await post('/api/notifications/read-all', {})).body.data.markedCount, 2); assert.equal(await unread(), 0);
      assert.equal((await post('/api/notifications/read-all', {})).body.data.markedCount, 0);
      await mongoose.connection.transaction(session => emitNotification({ recipient: users.alice._id, actor: users.bob._id, type: 'discussion_comment', resourceType: 'comment', resourceId: comment.id, eventKey: `comment:${comment.id}` }, session));
      assert.equal(await unread(), 0); assert.equal((await Notification.findById(firstNotice.id)).readAt.toISOString(), at);
    });
    await t.test('private-circle comments and invitations never expose titles or content after membership removal', async () => {
      privateCircle = (await post('/api/reading-circles', { name: 'PrivateCircleTitleSecret', description: 'PrivateCircleDescriptionSecret', visibility: 'private', membershipPolicy: 'invitation' })).body.data.item;
      const memberPath = `/api/reading-circles/${privateCircle.id}/members/${users.bob._id}`;
      assert.equal((await patch(memberPath, { action: 'invite' })).status, 200);
      const invitation = (await inbox('bob')).body.data.items[0]; assert.equal(invitation.type, 'circle_invitation');
      assert.equal(invitation.targetUrl, '/community/reading-circles?scope=invitations');
      assert.equal((await patch(memberPath, { action: 'invite' })).status, 200); assert.equal(await Notification.countDocuments({ recipient: users.bob._id, type: 'circle_invitation' }), 1);
      assert.equal((await post(`/api/reading-circles/${privateCircle.id}/join`, {}, 'bob')).status, 200);
      privateDiscussion = (await post('/api/discussions', { title: 'PrivateDiscussionTitleSecret', body: 'PrivateDiscussionBodySecret', circleId: privateCircle.id }, 'bob')).body.data.item;
      assert.equal((await commentOn(privateDiscussion.id, 'alice')).status, 201);
      const before = (await inbox('bob')).body.data.items.find(item => item.type === 'discussion_comment'); assert.equal(before.targetUrl, '/community/discussions/' + privateDiscussion.id);
      assert.equal((await patch(memberPath, { action: 'promote' })).status, 200); assert.equal((await patch(memberPath, { action: 'promote' })).status, 200);
      assert.equal(await Notification.countDocuments({ recipient: users.bob._id, type: 'circle_membership_changed' }), 1);
      assert.equal((await patch(memberPath, { action: 'remove' })).status, 200);
      const after = (await inbox('bob')).body.data.items, hidden = after.find(item => item.id === before.id);
      assert.equal(hidden.type, 'unavailable'); assert.equal(hidden.actor, null); assert.equal(hidden.resourceId, null); assert.equal(hidden.targetUrl, null);
      const removed = after.find(item => item.type === 'circle_membership_changed' && item.targetUrl === null); assert.ok(removed); assert.equal(removed.actor, null);
      assert.equal(JSON.stringify(after).includes(privateCircle.id), false); assert.equal(JSON.stringify(after).includes('Secret'), false);
      assert.equal((await inbox('outsider')).body.data.items.length, 0);
      assert.equal((await patch(`/api/notifications/${hidden.id}/read`, {}, 'bob')).status, 200);
    });
    await t.test('article approval, rejection, unpublication and community moderation notify only the content author', async () => {
      article = await draft();
      assert.equal((await post(`/api/articles/${article.id}/submit`, { expectedRevision: 0 })).status, 200);
      assert.equal((await review(article.id, 'reject')).status, 200);
      assert.equal(await Notification.countDocuments({ recipient: users.alice._id, type: 'article_rejected' }), 1);
      let current = (await request('/api/articles/mine/' + article.id)).body.data.item;
      assert.equal((await post(`/api/articles/${article.id}/submit`, { expectedRevision: current.revision })).status, 200);
      assert.equal((await review(article.id, 'approve')).status, 200); assert.equal((await review(article.id, 'unpublish')).status, 200);
      const items = (await inbox()).body.data.items;
      for (const type of ['article_approved', 'article_rejected']) { const item = items.find(item => item.type === type); assert.equal(item.targetUrl, '/articles/mine/' + article.id); assert.equal(item.actor, null); }
      assert.equal((await post('/api/moderation/actions', { targetType: 'discussion', targetId: discussion.id, action: 'hide', reason: 'Private moderation reason' }, 'moderator')).status, 200);
      const moderation = (await inbox()).body.data.items.find(item => item.type === 'content_moderated' && item.resourceType === 'discussion'); assert.ok(moderation); assert.equal(moderation.targetUrl, null); assert.equal(moderation.actor, null);
      assert.equal(await unread('moderator'), 0); assert.equal(await unread('outsider'), 0);
    });
    await t.test('reporter updates are private generic acknowledgements and repeated case-status requests deduplicate', async () => {
      const report = await post('/api/reports', { targetType: 'article', targetId: article.id, reason: 'spam' }, 'bob'); assert.equal(report.status, 404); // Unpublished article.
      const published = await draft(); await post(`/api/articles/${published.id}/submit`, { expectedRevision: 0 }); await review(published.id, 'approve');
      const created = await post('/api/reports', { targetType: 'article', targetId: published.id, reason: 'other', details: 'Private report details secret' }, 'bob'); assert.equal(created.status, 201);
      for (let i = 0; i < 2; i++) assert.equal((await patch('/api/moderation/reports/' + created.body.data.id, { status: 'reviewed', reason: 'Internal review reason secret' }, 'moderator')).status, 200);
      assert.equal(await Notification.countDocuments({ recipient: users.bob._id, type: 'report_reviewed' }), 1);
      assert.equal((await patch('/api/moderation/reports/' + created.body.data.id, { status: 'resolved', reason: 'Internal resolution secret' }, 'moderator')).status, 200);
      const item = (await inbox('bob')).body.data.items.find(item => item.type === 'report_resolved'); assert.equal(item.actor, null); assert.equal(item.targetUrl, null);
      assert.equal(JSON.stringify(item).includes(published.id), false);
    });
    await t.test('missing actors and deleted resources safely redact current notification responses', async () => {
      const visible = (await post('/api/discussions', { title: 'Visible test', body: 'Test body' })).body.data.item;
      const reply = (await commentOn(visible.id, 'outsider')).body.data.item;
      const notice = await Notification.findOne({ recipient: users.alice._id, resourceId: reply.id }).lean();
      await User.deleteOne({ _id: users.outsider._id });
      let item = (await inbox()).body.data.items.find(item => item.id === String(notice._id)); assert.equal(item.actor, null); assert.ok(item.targetUrl);
      await Comment.deleteOne({ _id: reply.id }); item = (await inbox()).body.data.items.find(item => item.id === String(notice._id)); assert.equal(item.type, 'unavailable'); assert.equal(item.resourceId, null);
      await Circle.deleteOne({ _id: privateCircle.id });
      const circleNotice = (await inbox('bob')).body.data.items.find(item => item.resourceType === 'circle_membership'); assert.equal(circleNotice, undefined);
    });
    await t.test('inactive recipients and inaccessible private resources never receive newly fabricated events', async () => {
      const target = await Discussion.create({ author: users.inactive._id, title: 'Inactive author', body: 'Inactive author body', visibility: 'public' });
      assert.equal((await commentOn(String(target._id))).status, 201); assert.equal(await Notification.countDocuments({ recipient: users.inactive._id }), 0);
      const raw = await Notification.findOne({ recipient: users.alice._id, type: 'discussion_comment' }).lean();
      await mongoose.connection.transaction(session => emitNotification({ recipient: users.bob._id, actor: users.alice._id, type: 'discussion_comment', resourceType: 'comment', resourceId: raw.resourceId, eventKey: `comment:${raw.resourceId}` }, session));
      assert.equal(await Notification.countDocuments({ recipient: users.bob._id, resourceId: raw.resourceId, type: 'discussion_comment' }), 0);
      for (const auth of [null, {}, { user: { _id: users.alice._id, isActive: true } }]) await assert.rejects(service.list(auth), { status: 401 });
    });
    await t.test('email provider failures cannot break in-app originating operations; no activity email is attempted', async () => {
      let calls = 0; const originalReset = email.sendPasswordReset, originalVerify = email.sendEmailVerification;
      try {
        email.sendPasswordReset = email.sendEmailVerification = async () => { calls++; throw new Error('Synthetic unavailable email provider'); };
        const visible = (await post('/api/discussions', { title: 'Provider-independent operation', body: 'Body' })).body.data.item;
        const result = await commentOn(visible.id); assert.equal(result.status, 201);
        assert.equal(await Notification.countDocuments({ recipient: users.alice._id, resourceId: result.body.data.item.id }), 1); assert.equal(calls, 0);
      } finally { email.sendPasswordReset = originalReset; email.sendEmailVerification = originalVerify; }
    });
    await t.test('notification failures roll back source comments and failed audits never leave phantom notifications', async () => {
      const visible = (await post('/api/discussions', { title: 'Rollback check', body: 'Body' })).body.data.item;
      const original = Notification.updateOne, count = await Notification.countDocuments();
      try { Notification.updateOne = async () => { throw new Error('Synthetic notification write failure'); }; assert.equal((await commentOn(visible.id)).status, 500); }
      finally { Notification.updateOne = original; }
      assert.equal(await Comment.countDocuments({ discussion: visible.id }), 0); assert.equal(await Notification.countDocuments(), count);
      const originalAudit = Audit.create;
      try { Audit.create = async () => { throw new Error('Synthetic audit failure'); }; assert.equal((await post('/api/moderation/actions', { targetType: 'discussion', targetId: visible.id, action: 'hide', reason: 'Audit rollback' }, 'moderator')).status, 500); }
      finally { Audit.create = originalAudit; }
      assert.equal(await Notification.countDocuments(), count); assert.equal((await Discussion.findById(visible.id)).status, 'active');
    });
    await t.test('stored and serialized notifications contain no prose, secrets, arbitrary messages or canonical changes', async () => {
      const raw = await Notification.find().select('+eventKey').lean(), rendered = JSON.stringify((await inbox()).body);
      for (const value of ['Discussion prose secret', 'Comment prose secret', 'Private article body secret', 'Private report details secret', 'Internal review reason secret', 'Private moderation reason', 'PrivateCircleTitleSecret']) assert.equal(JSON.stringify(raw).includes(value), false, value);
      for (const field of ['passwordHash', 'passwordResetToken', 'tokenHash', 'sessionId', 'recipient', 'eventKey']) assert.equal(rendered.includes('"' + field + '"'), false, field);
      const candidate = { recipient: users.alice._id, type: 'discussion_comment', actor: users.bob._id, resourceType: 'comment', resourceId: comment.id, eventKey: `comment:${comment.id}` };
      await assert.rejects(new Notification({ ...candidate, message: 'Arbitrary secret' }).validate(), /message/);
      await assert.rejects(new Notification({ ...candidate, type: 'page_view' }).validate(), /type/);
      assert.throws(() => new Notification({ ...candidate, privateNote: 'secret' }), /strict/);
      assert.equal(canonicalHash(), before); assert.equal((await request('/api/books', { user: null })).status, 200);
      await Notification.collection.dropIndex('notification_recipient_event_unique'); await assert.rejects(assertNotificationStorage(), { status: 503 });
      assert.equal((await inbox()).status, 503); await Notification.createIndexes();
    });
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); await memory.stop(); }
});
