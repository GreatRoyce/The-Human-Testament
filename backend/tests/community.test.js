// Synthetic identities and isolated loopback replica set only; no Atlas or mail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
process.env.NODE_ENV = 'production'; process.env.CONTENT_SOURCE = 'pdf'; process.env.AUTH_ENABLED = 'true';
process.env.AUTH_ACCESS_TOKEN_SECRET = randomBytes(48).toString('base64url');
process.env.AUTH_ALLOWED_ORIGINS = 'https://reader.example.test'; process.env.MAIL_DELIVERY_ENABLED = 'false';
process.env.COMMUNITY_POSTING_ENABLED = 'true'; delete process.env.AUTH_ALLOW_INSECURE_LOCALHOST;
const app = require('../src/app');
const User = require('../src/models/User');
const Discussion = require('../src/models/Discussion');
const Comment = require('../src/models/Comment');
const Circle = require('../src/models/ReadingCircle');
const Membership = require('../src/models/CircleMembership');
const Report = require('../src/models/ContentReport');
const Audit = require('../src/models/ModerationAction');
const Moderator = require('../src/models/CommunityModerator');
const { initializeAuthStorage } = require('../src/services/authStorage');
const { initializeCommunityStorage, assertCommunityStorage } = require('../src/services/communityStorage');
const { createSession } = require('../src/services/session.service');
const { getAuthConfig } = require('../src/config/auth');
const hash = () => createHash('sha256').update(readFileSync(require.resolve('../../shared/manuscript.json'))).digest('hex');
test('community ownership, privacy, moderation and manuscript separation', { timeout: 1800000 }, async t => {
  const canonicalBefore = hash();
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  let server;
  try {
    assert.match(memory.getUri(), /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(memory.getUri(), { dbName: 'community_test', autoCreate: false, autoIndex: false });
    await initializeAuthStorage(); await initializeCommunityStorage();
    const passwordHash = await bcrypt.hash('Synthetic community test passphrase!', 12);
    const accounts = {}, tokens = {};
    for (const name of ['alice', 'bob', 'moderator', 'outsider', 'unverified', 'limited']) {
      accounts[name] = await User.create({ email: `${name}@example.test`, displayName: name, emailVerified: name !== 'unverified', passwordHash });
      tokens[name] = (await createSession(await User.findById(accounts[name]._id).select('+passwordHash'), getAuthConfig())).accessToken;
    }
    await Moderator.create({ user: accounts.moderator._id, grantedBy: 'synthetic-test-operator', reason: 'Local fixture only' });
    app.set('trust proxy', 1);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    let sequence = 0;
    async function request(path, { method = 'GET', body, user = 'alice', headers = {} } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, signal: AbortSignal.timeout(20000), headers: {
        Origin: process.env.AUTH_ALLOWED_ORIGINS, 'Content-Type': 'application/json', 'X-CSRF-Protection': '1',
        'X-Forwarded-For': `198.18.${Math.floor(++sequence / 250)}.${sequence % 250 + 1}`,
        ...(user ? { Authorization: 'Bearer ' + (tokens[user] ?? user) } : {}), ...headers,
      }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    }
    const post = (path, body, user = 'alice') => request(path, { method: 'POST', body, user });
    const patch = (path, body, user = 'alice') => request(path, { method: 'PATCH', body, user });
    const remove = (path, user = 'alice') => request(path, { method: 'DELETE', body: {}, user });
    const makeDiscussion = (extra = {}, user = 'alice') => post('/api/discussions', { title: 'A reader question', body: 'Reader interpretation only.', ...extra }, user);
    const moderate = (targetType, targetId, action, user = 'moderator') => post('/api/moderation/actions', { targetType, targetId, action, reason: 'Synthetic policy review' }, user);
    const publicBefore = await request('/api/verses/freedom:10:14', { user: null });
    let discussionId, circleId, privateId, privateDiscussion, commentId, reportId;
    await t.test('all writes require a valid active session, verified email and CSRF', async () => {
      for (const user of [null, 'forged-token']) assert.equal((await makeDiscussion({}, user)).status, 401);
      assert.equal((await makeDiscussion({}, 'unverified')).status, 403);
      assert.equal((await request('/api/discussions', { method: 'POST', body: { title: 'Denied', body: 'Denied' }, headers: { Origin: 'https://attacker.test' } })).status, 403);
      assert.equal((await request('/api/discussions', { method: 'POST', body: {}, headers: { 'X-CSRF-Protection': '' } })).status, 403);
      const result = await makeDiscussion({ bookId: 'freedom', chapterNumber: 10, verseId: 'freedom:10:14', body: '<script>alert(1)</script> Plain text.' });
      assert.equal(result.status, 201, JSON.stringify(result.body)); discussionId = result.body.data.item.id;
      const stored = await Discussion.findById(discussionId); assert.equal(String(stored.author), String(accounts.alice._id));
      assert.equal(stored.body, '<script>alert(1)</script> Plain text.'); assert.ok(stored.createdAt); assert.ok(stored.updatedAt);
      assert.equal(result.body.data.item.author.email, undefined); assert.equal(result.headers.get('cache-control'), 'no-store');
    });
    await t.test('strict model and request validation preserves canonical reference identity', async () => {
      for (const extra of [{ bookId: 'unknown' }, { chapterNumber: 10 }, { bookId: 'freedom', chapterNumber: 999 },
        { verseId: 'freedom:10:14' }, { bookId: 'freedom', chapterNumber: 1, verseId: 'freedom:10:14' },
        { bookId: 'freedom', chapterNumber: 10, verseId: 'freedom:10:999' }, { title: ' ' }, { body: 'x'.repeat(10001) },
        { author: String(accounts.bob._id) }, { status: 'active' }, { visibility: 'public' }, { title: { $ne: '' } }]) {
        assert.equal((await makeDiscussion(extra, 'outsider')).status, 400, JSON.stringify(extra).slice(0, 160));
      }
      await assert.rejects(new Discussion({ author: accounts.alice._id, title: 'Test', body: 'Test', visibility: 'circle' }).validate(), /visibility/);
      await assert.rejects(new Discussion({ author: accounts.alice._id, title: 'Test', body: 'Test', visibility: 'public', bookId: 'freedom', chapterNumber: 1, verseId: 'freedom:10:14' }).validate(), /inconsistent/);
      await assert.rejects(new Circle({ owner: accounts.alice._id, name: 'Test', visibility: 'private', membershipPolicy: 'open' }).validate(), /invitation/);
      for (const Model of [Discussion, Comment, Circle, Membership, Report, Audit, Moderator]) assert.throws(() => new Model({ injected: 'Denied' }), /strict mode/);
    });
    await t.test('public lists support exact passage filters and stable bounded pagination', async () => {
      assert.equal((await makeDiscussion({}, 'bob')).status, 201);
      const result = await request('/api/discussions?bookId=freedom&chapterNumber=10&verseId=freedom:10:14', { user: null });
      assert.equal(result.status, 200); assert.equal(result.body.data.pagination.total, 1); assert.equal(result.body.data.items[0].id, discussionId);
      const first = await request('/api/discussions?limit=1'), second = await request('/api/discussions?limit=1&page=2');
      assert.notEqual(first.body.data.items[0].id, second.body.data.items[0].id);
      for (const query of ['limit=51', 'page=01', 'page=10001', 'status=hidden', 'user=x', 'verseId[$ne]=x', 'limit=1&limit=2', 'chapterNumber=01&bookId=freedom']) assert.equal((await request('/api/discussions?' + query)).status, 400, query);
      assert.equal((await request('/api/discussions/' + discussionId, { user: 'forged-token' })).status, 401);
    });
    await t.test('discussion mutations are author-scoped and reject ownership or passage reassignment', async () => {
      for (const key of ['author', 'role', 'status', 'bookId', 'circleId', '$set']) assert.equal((await patch('/api/discussions/' + discussionId, { [key]: 'forged' })).status, 400);
      for (const target of [discussionId, String(new mongoose.Types.ObjectId()), 'invalid']) {
        assert.equal((await patch('/api/discussions/' + target, { body: 'Hijack' }, 'bob')).status, 404);
        assert.equal((await remove('/api/discussions/' + target, 'bob')).status, 404);
      }
      assert.equal((await patch('/api/discussions/' + discussionId, { title: 'Updated reader question' })).status, 200);
    });
    await t.test('flat comments paginate, count only visible records, and enforce authorship', async () => {
      for (const body of ['First comment', 'Second comment', 'Third comment']) {
        const result = await post(`/api/discussions/${discussionId}/comments`, { body }, 'bob'); assert.equal(result.status, 201); commentId ??= result.body.data.item.id;
      }
      assert.equal((await post(`/api/discussions/${discussionId}/comments`, { body: 'No nested replies', parentComment: commentId }, 'bob')).status, 400);
      const result = await request(`/api/discussions/${discussionId}/comments?limit=2`, { user: null });
      assert.equal(result.body.data.items.length, 2); assert.equal(result.body.data.pagination.total, 3);
      assert.equal((await patch('/api/comments/' + commentId, { body: 'Edited by Bob' }, 'bob')).status, 200);
      assert.equal((await patch('/api/comments/' + commentId, { body: 'Hijack' })).status, 404);
      assert.equal((await remove('/api/comments/' + commentId)).status, 404);
      const third = (await request(`/api/discussions/${discussionId}/comments?page=2&limit=2`)).body.data.items[0].id;
      assert.equal((await remove('/api/comments/' + third, 'bob')).status, 200);
      assert.equal((await request('/api/discussions/' + discussionId)).body.data.item.commentCount, 2);
      assert.equal((await Comment.findById(third)).status, 'deleted');
    });
    await t.test('public circles have atomic owner membership and unique member accounts', async () => {
      const result = await post('/api/reading-circles', { name: 'Public readers', description: 'Readers, not official editors.', visibility: 'public', membershipPolicy: 'open' });
      assert.equal(result.status, 201, JSON.stringify(result.body)); circleId = result.body.data.item.id;
      assert.equal(await Membership.countDocuments({ circle: circleId, user: accounts.alice._id, role: 'owner', status: 'active' }), 1);
      const joins = await Promise.all([post(`/api/reading-circles/${circleId}/join`, {}, 'bob'), post(`/api/reading-circles/${circleId}/join`, {}, 'bob')]);
      assert.ok(joins.every(result => result.status === 200), JSON.stringify(joins));
      assert.equal(await Membership.countDocuments({ circle: circleId, user: accounts.bob._id }), 1);
      await assert.rejects(Membership.collection.insertOne({ circle: new mongoose.Types.ObjectId(circleId), user: accounts.bob._id }), error => error.code === 11000);
      assert.equal((await post(`/api/reading-circles/${circleId}/join`, { role: 'owner' }, 'bob')).status, 400);
      assert.equal((await patch(`/api/reading-circles/${circleId}/members/${accounts.bob._id}`, { action: 'promote' }, 'bob')).status, 404);
      assert.equal((await patch(`/api/reading-circles/${circleId}/members/${accounts.bob._id}`, { action: 'promote' })).status, 200);
      assert.equal((await Membership.findOne({ circle: circleId, user: accounts.bob._id })).role, 'moderator');
      assert.equal((await patch(`/api/reading-circles/${circleId}/members/${accounts.alice._id}`, { action: 'demote' })).status, 403);
    });
    await t.test('private circles require invitations and hide content, rosters and reports from outsiders', async () => {
      const result = await post('/api/reading-circles', { name: 'Private readers', description: 'Private circle secret', visibility: 'private', membershipPolicy: 'invitation' });
      assert.equal(result.status, 201); privateId = result.body.data.item.id;
      const created = await makeDiscussion({ circleId: privateId, body: 'Private contribution secret' }); assert.equal(created.status, 201); privateDiscussion = created.body.data.item.id;
      assert.equal((await post(`/api/discussions/${privateDiscussion}/comments`, { body: 'Private reply secret' })).status, 201);
      for (const user of [null, 'outsider', 'moderator']) for (const path of [`/api/reading-circles/${privateId}`, `/api/reading-circles/${privateId}/members`, `/api/discussions/${privateDiscussion}`, `/api/discussions/${privateDiscussion}/comments`, `/api/discussions?circleId=${privateId}`]) {
        const result = await request(path, { user }); assert.equal(result.status, 404, path + ':' + user);
        assert.equal(JSON.stringify(result.body).includes('secret'), false);
      }
      assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'bob')).status, 404);
      assert.equal((await patch(`/api/reading-circles/${privateId}/members/${accounts.bob._id}`, { action: 'invite' })).status, 200);
      const invitations = await request('/api/reading-circles?scope=invitations', { user: 'bob' });
      assert.equal(invitations.body.data.items[0].description, '');
      assert.equal((await request('/api/discussions/' + privateDiscussion, { user: 'bob' })).status, 404);
      assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'bob')).status, 200);
      assert.equal((await request('/api/discussions/' + privateDiscussion, { user: 'bob' })).status, 200);
      assert.equal((await request(`/api/reading-circles/${privateId}/members`, { user: 'bob' })).body.data.items.length, 2);
      assert.equal((await request(`/api/moderation/reports?circleId=${privateId}`, { user: 'bob' })).status, 403);
      assert.equal((await patch(`/api/reading-circles/${privateId}/members/${accounts.bob._id}`, { action: 'promote' })).status, 200);
      const scopedReport = await post('/api/reports', { targetType: 'discussion', targetId: privateDiscussion, reason: 'other', details: 'Circle-scoped report' });
      assert.equal(scopedReport.status, 201);
      assert.equal((await request(`/api/moderation/reports?circleId=${privateId}`, { user: 'bob' })).body.data.items[0].details, 'Circle-scoped report');
      assert.equal((await patch('/api/moderation/reports/' + scopedReport.body.data.id, { status: 'reviewed', reason: 'Circle moderator review' }, 'bob')).status, 200);
      assert.equal((await moderate('discussion', privateDiscussion, 'lock', 'bob')).status, 200);
      assert.equal((await request(`/api/moderation/audit?targetType=discussion&targetId=${privateDiscussion}`, { user: 'bob' })).body.data.items[0].action, 'lock');
      assert.equal((await moderate('discussion', privateDiscussion, 'unlock', 'bob')).status, 200);
      assert.equal((await request('/api/discussions', { user: null })).body.data.items.some(item => item.id === privateDiscussion), false);
      assert.equal((await request('/api/reading-circles', { user: null })).body.data.items.some(item => item.id === privateId), false);
      assert.equal((await patch(`/api/reading-circles/${privateId}/members/${accounts.bob._id}`, { action: 'remove' })).status, 200);
      assert.equal((await request('/api/discussions/' + privateDiscussion, { user: 'bob' })).status, 404);
      assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'bob')).status, 404);
      const privateReport = await post('/api/reports', { targetType: 'discussion', targetId: privateDiscussion, reason: 'other', details: 'Private report secret' });
      assert.equal(privateReport.status, 201);
      assert.equal(JSON.stringify((await request('/api/moderation/reports?status=reviewed', { user: 'moderator' })).body).includes('Circle-scoped report'), false);
      assert.equal((await patch(`/api/reading-circles/${privateId}/members/${accounts.moderator._id}`, { action: 'invite' })).status, 200);
      assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'moderator')).status, 200);
      const privateQueue = await request('/api/moderation/reports?status=reviewed', { user: 'moderator' });
      assert.equal(privateQueue.body.data.items[0].context.body, 'Private contribution secret');
      assert.equal((await patch(`/api/reading-circles/${privateId}/members/${accounts.moderator._id}`, { action: 'remove' })).status, 200);
      assert.equal((await patch('/api/moderation/reports/' + privateReport.body.data.id, { status: 'resolved', reason: 'No longer a member' }, 'moderator')).status, 404);
      // Invitations can be revoked before acceptance or declined by their recipient.
      const invitationPath = `/api/reading-circles/${privateId}/members/${accounts.outsider._id}`;
      assert.equal((await patch(invitationPath, { action: 'invite' })).status, 200);
      assert.equal((await patch(invitationPath, { action: 'remove' })).status, 200);
      assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'outsider')).status, 404);
      assert.equal((await patch(invitationPath, { action: 'invite' })).status, 200);
      assert.equal((await post(`/api/reading-circles/${privateId}/leave`, {}, 'outsider')).status, 200);
      assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'outsider')).status, 404);
    });
    await t.test('circle moderators are scoped; owners archive on leaving and cannot transfer through input', async () => {
      const created = await makeDiscussion({ circleId }); assert.equal(created.status, 201); const target = created.body.data.item.id;
      assert.equal((await moderate('discussion', target, 'hide', 'bob')).status, 200);
      assert.equal((await moderate('discussion', target, 'restore', 'bob')).status, 200);
      assert.equal((await moderate('discussion', discussionId, 'hide', 'bob')).status, 403);
      assert.equal((await patch('/api/reading-circles/' + circleId, { owner: String(accounts.bob._id) })).status, 400);
      assert.equal((await patch('/api/reading-circles/' + circleId, { name: 'Hijack' }, 'bob')).status, 404);
      assert.equal((await post(`/api/reading-circles/${circleId}/leave`, {})).status, 200);
      assert.equal((await Circle.findById(circleId)).status, 'archived');
      assert.equal((await Membership.findOne({ circle: circleId, user: accounts.alice._id })).status, 'removed');
      assert.equal((await makeDiscussion({ circleId }, 'bob')).status, 403);
      assert.equal((await post(`/api/discussions/${target}/comments`, { body: 'No archived posting' }, 'bob')).status, 409);
      assert.equal((await request('/api/discussions/' + target, { user: 'bob' })).status, 200);
      assert.equal((await post(`/api/reading-circles/${circleId}/join`, {}, 'outsider')).status, 404);
      assert.equal((await patch('/api/reading-circles/' + circleId, { status: 'active' })).status, 409);
    });
    await t.test('reporting validates visible targets, deduplicates and protects review information', async () => {
      const body = { targetType: 'discussion', targetId: discussionId, reason: 'spam', details: 'Moderator-only report detail' };
      for (const extra of [{ targetType: 'user' }, { targetId: 'bad' }, { targetId: String(new mongoose.Types.ObjectId()) }, { targetId: privateDiscussion }, { details: 'x'.repeat(1001) }, { reporter: String(accounts.alice._id) }]) {
        const result = await post('/api/reports', { ...body, ...extra }, 'bob'); assert.ok([400, 404].includes(result.status), JSON.stringify(result));
      }
      const result = await post('/api/reports', body, 'bob'); assert.equal(result.status, 201); reportId = result.body.data.id;
      assert.deepEqual(Object.keys(result.body.data).sort(), ['id', 'status']);
      assert.equal((await post('/api/reports', { ...body, details: 'Do not overwrite' }, 'bob')).body.data.id, reportId);
      assert.equal(await Report.countDocuments({ reporter: accounts.bob._id, targetId: discussionId }), 1);
      assert.equal((await Report.findById(reportId)).details, body.details);
      for (const path of ['/api/moderation/reports', '/api/moderation/audit?targetType=discussion&targetId=' + discussionId]) assert.equal((await request(path, { user: 'bob' })).status, 403);
      assert.equal((await patch('/api/moderation/reports/' + reportId, { status: 'resolved', reason: 'Self review' }, 'bob')).status, 403);
      const queue = await request('/api/moderation/reports', { user: 'moderator' }); assert.equal(queue.status, 200);
      assert.equal(queue.body.data.items[0].details, body.details); assert.equal(queue.body.data.items[0].reporter, undefined);
      assert.equal((await patch('/api/moderation/reports/' + reportId, { status: 'reviewed', reason: 'Moderator triage' }, 'moderator')).status, 200);
      assert.equal(await Audit.countDocuments({ targetType: 'report', targetId: reportId, action: 'review' }), 1);
      for (let count = 0; count < 10; count++) assert.equal((await post('/api/reports', body, 'limited')).status, 201);
      assert.equal((await post('/api/reports', body, 'limited')).status, 429);
    });
    await t.test('posting, commenting and joining limits follow the account across IP changes', async () => {
      let target;
      for (let count = 0; count < 20; count++) { const result = await makeDiscussion({}, 'limited'); assert.equal(result.status, 201); target ??= result.body.data.item.id; }
      assert.equal((await makeDiscussion({}, 'limited')).status, 429);
      for (let count = 0; count < 40; count++) assert.equal((await post(`/api/discussions/${target}/comments`, { body: 'Rate limit fixture' }, 'limited')).status, 201);
      assert.equal((await post(`/api/discussions/${target}/comments`, { body: 'Excess' }, 'limited')).status, 429);
      assert.equal((await patch(`/api/reading-circles/${privateId}/members/${accounts.limited._id}`, { action: 'invite' })).status, 200);
      for (let count = 0; count < 20; count++) assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'limited')).status, 200);
      assert.equal((await post(`/api/reading-circles/${privateId}/join`, {}, 'limited')).status, 429);
    });
    await t.test('moderation audit failures roll back the content state', async () => {
      const original = Audit.create;
      try {
        Audit.create = async () => { throw new Error('Synthetic audit failure'); };
        assert.equal((await moderate('discussion', discussionId, 'hide')).status, 500);
      } finally { Audit.create = original; }
      assert.equal((await Discussion.findById(discussionId)).status, 'active');
      assert.equal(await Audit.countDocuments({ targetId: discussionId }), 0);
    });
    await t.test('moderation hides, restores, locks and removes with atomic permanent audits', async () => {
      assert.equal((await moderate('discussion', discussionId, 'lock', 'bob')).status, 403);
      assert.equal((await moderate('discussion', discussionId, 'lock')).status, 200);
      assert.equal((await post(`/api/discussions/${discussionId}/comments`, { body: 'Locked' }, 'bob')).status, 409);
      assert.equal((await patch('/api/comments/' + commentId, { body: 'Locked edit' }, 'bob')).status, 409);
      assert.equal((await moderate('discussion', discussionId, 'hide')).status, 200);
      assert.equal((await request('/api/discussions/' + discussionId, { user: null })).status, 404);
      assert.equal((await request(`/api/discussions/${discussionId}/comments`, { user: null })).status, 404);
      assert.equal((await moderate('discussion', discussionId, 'restore')).status, 200);
      assert.equal((await Discussion.findById(discussionId)).status, 'locked');
      assert.equal((await moderate('discussion', discussionId, 'unlock')).status, 200);
      assert.equal((await moderate('comment', commentId, 'hide')).status, 200);
      assert.equal((await request('/api/discussions/' + discussionId)).body.data.item.commentCount, 1);
      assert.equal((await moderate('comment', commentId, 'restore')).status, 200);
      const history = await request(`/api/moderation/audit?targetType=discussion&targetId=${discussionId}`, { user: 'moderator' });
      assert.equal(history.status, 200); assert.equal(history.body.data.items.length, 4);
      const own = await makeDiscussion({}, 'moderator'); assert.equal(own.status, 201);
      assert.equal((await moderate('discussion', own.body.data.item.id, 'hide')).status, 403);
      const ownReport = await post('/api/reports', { targetType: 'discussion', targetId: discussionId, reason: 'other' }, 'moderator');
      assert.equal((await patch('/api/moderation/reports/' + ownReport.body.data.id, { status: 'resolved', reason: 'No self review' }, 'moderator')).status, 403);
      assert.equal((await moderate('discussion', discussionId, 'delete')).status, 200);
      assert.equal((await moderate('discussion', discussionId, 'restore')).status, 409);
      assert.equal((await request('/api/discussions/' + discussionId)).status, 404);
      assert.equal(await Audit.countDocuments({ targetId: discussionId }), 5);
      assert.equal(await Comment.countDocuments({ discussion: discussionId }), 3); // Retained for moderation; inaccessible publicly.
    });
    await t.test('posting gate fails closed while moderation and withdrawals remain available', async () => {
      delete process.env.COMMUNITY_POSTING_ENABLED;
      assert.equal((await makeDiscussion()).status, 503);
      assert.equal((await request('/api/discussions', { user: null })).status, 200);
      assert.equal((await request('/api/moderation/reports', { user: 'moderator' })).status, 200);
      process.env.COMMUNITY_POSTING_ENABLED = 'true';
      await Moderator.updateOne({ user: accounts.moderator._id }, { revokedAt: new Date() });
      assert.equal((await makeDiscussion()).status, 503);
      assert.equal((await request('/api/moderation/reports', { user: 'moderator' })).status, 403);
      await Moderator.updateOne({ user: accounts.moderator._id }, { $unset: { revokedAt: '' } });
      await User.updateOne({ _id: accounts.unverified._id }, { isActive: false });
      assert.equal((await makeDiscussion({}, 'unverified')).status, 401);
      await Membership.collection.dropIndex('circle_user_unique');
      await assert.rejects(assertCommunityStorage(), { status: 503 });
      assert.equal((await request('/api/discussions', { user: null })).status, 503);
      await Membership.createIndexes();
    });
    await t.test('community CRUD never changes canonical APIs, PDF corpus or public manuscript search', async () => {
      const standalone = await makeDiscussion({ title: 'CommunityNeedleOnly', body: 'PrivateNeedleNotCanonical' }); assert.equal(standalone.status, 201);
      assert.equal((await remove('/api/discussions/' + standalone.body.data.item.id)).status, 200);
      assert.deepEqual((await request('/api/verses/freedom:10:14', { user: null })).body, publicBefore.body);
      for (const q of ['CommunityNeedleOnly', 'Private contribution secret', 'Moderator-only report detail']) {
        const search = await request('/api/search?q=' + encodeURIComponent(q), { user: null }); assert.equal(search.status, 200); assert.equal(search.body.data.length, 0);
      }
      assert.equal(hash(), canonicalBefore);
      assert.equal((await request('/api/health', { user: null })).status, 200);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await memory.stop();
  }
});
