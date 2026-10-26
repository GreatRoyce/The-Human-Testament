import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { createReadingService, readingLocationUrl, readingLocationLabel, sameReadingLocation } from '../src/services/reading.service.js';
import { createReadingCheckpoints } from '../src/features/reader/utils/readingCheckpoints.js';
const location = { bookId: 'freedom', chapterNumber: 10, verseNumber: 14 };
const progress = { ...location, revision: 1, lastReadAt: '2026-10-24T12:00:00.000Z', createdAt: '2026-10-24T12:00:00.000Z', updatedAt: '2026-10-24T12:00:00.000Z' };
const history = { ...location, id: 'b'.repeat(24), visitedAt: progress.lastReadAt, createdAt: progress.createdAt };
const pagination = { page: 1, limit: 20, total: 1, pages: 1 };
const user = { id: 'a'.repeat(24), email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: false, isActive: true };
const loginResponse = () => ({ success: true, data: { user, accessToken: 'synthetic-access', expiresIn: 900 } });
function clock() {
  let sequence = 0;
  const jobs = new Map();
  return {
    schedule(fn, delay) { assert.equal(delay, 1000); jobs.set(++sequence, fn); return sequence; },
    cancel(id) { jobs.delete(id); },
    get count() { return jobs.size; },
    run() { const [id, fn] = jobs.entries().next().value; jobs.delete(id); return fn(); },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('reading services reuse authenticated GET/PUT, exact revision/event payloads, signals and safe URLs', async () => {
  const calls = [], eventId = randomUUID();
  const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.pathname.endsWith('/login')) return Response.json(loginResponse());
    if (url.pathname.endsWith('/inquiry')) return Response.json({ success: false, message: 'Reading progress not found.' }, { status: 404 });
    return Response.json({ success: true, data: init.method === 'PUT' ? { item: progress, replayed: false } :
      url.pathname === '/api/reading-progress' ? { items: [progress] } :
      url.pathname === '/api/reading-history' ? { items: [history], pagination } : { item: progress } });
  } });
  const auth = createAuthService(client), service = createReadingService(auth), signal = new AbortController().signal;
  await assert.rejects(service.list(), { status: 401 }); assert.equal(calls.length, 0);
  await auth.login({ email: user.email, password: 'Synthetic' });
  assert.deepEqual(await service.list({ signal }), [progress]);
  assert.deepEqual(await service.get('freedom', { signal }), progress);
  assert.equal(await service.get('inquiry', { signal }), null);
  const saved = await service.save('freedom', { ...location, expectedRevision: 0, eventId, userId: 'must not forward', text: 'must not copy' }, { signal });
  assert.deepEqual(saved, { item: progress, replayed: false });
  assert.deepEqual(JSON.parse(calls[4].init.body), { chapterNumber: 10, verseNumber: 14, expectedRevision: 0, eventId });
  await service.history({ page: 1, limit: 20, bookId: 'freedom' }, { signal });
  for (const { init } of calls.slice(1)) { assert.equal(init.signal, signal); assert.equal(init.credentials, 'include'); assert.equal(init.headers.Authorization, 'Bearer synthetic-access'); }
  assert.equal(calls[4].init.method, 'PUT'); assert.equal(calls[4].init.headers['Content-Type'], 'application/json'); assert.equal(calls[4].init.headers['X-CSRF-Protection'], '1');
  assert.equal(calls[5].url.searchParams.get('bookId'), 'freedom');
  assert.equal(readingLocationUrl(progress), '/testament/freedom/10/14');
  assert.equal(readingLocationUrl({ bookId: 'inquiry', chapterNumber: 2 }), '/testament/inquiry/2');
  assert.equal(readingLocationLabel(progress), 'Freedom 10:14'); assert.equal(sameReadingLocation(progress, location), true);
  assert.equal(auth.accessToken, undefined);
  await assert.rejects(service.get('../other'), /Invalid/);
});

test('progress/history contracts reject leaked ownership, credentials, canonical text and malformed locations', async () => {
  for (const item of [{ ...progress, user: user.id }, { ...progress, passwordHash: 'do not expose' }, { ...progress, text: 'no verse copy' },
    { ...progress, chapterNumber: 0 }, { ...progress, verseNumber: null }, { ...progress, revision: 0 }, { ...progress, lastReadAt: 'invalid' }]) {
    const service = createReadingService({ privateRequest: async () => ({ success: true, data: { item } }) });
    await assert.rejects(service.get('freedom'), { code: 'INVALID_RESPONSE' });
  }
  const service = createReadingService({ privateRequest: async () => ({ success: true, data: { items: [{ ...history, eventId: randomUUID() }], pagination } }) });
  await assert.rejects(service.history(), { code: 'INVALID_RESPONSE' });
});

test('rapid navigation coalesces into one checkpoint and current-location retries add no history', async () => {
  const timer = clock(), writes = [], reads = [], completed = [];
  let stored = null;
  const service = { sessionVersion: () => 1, get: async book => { reads.push(book); return stored; },
    save: async (bookId, input) => { writes.push(input); stored = { bookId, chapterNumber: input.chapterNumber, verseNumber: input.verseNumber, revision: 1 }; return { item: stored }; } };
  const tracker = createReadingCheckpoints({ service, schedule: timer.schedule, cancel: timer.cancel, eventId: randomUUID });
  for (let number = 1; number <= 18; number++) tracker.schedule({ ...location, verseNumber: number }, { onSuccess: item => completed.push(item) });
  assert.equal(timer.count, 1); assert.equal(reads.length, 0);
  await timer.run(); assert.equal(reads.length, 1); assert.equal(writes.length, 1); assert.equal(writes[0].verseNumber, 18);
  assert.equal(writes[0].expectedRevision, 0); assert.equal(completed.length, 1);
  tracker.schedule({ ...location, verseNumber: 18 }, { retry: true }); await timer.run();
  assert.equal(reads.length, 2); assert.equal(writes.length, 1);
});

test('deliberately reopening a previously saved location refreshes progress and records a new visit', async () => {
  const timer = clock(), writes = [];
  const tracker = createReadingCheckpoints({ schedule: timer.schedule, cancel: timer.cancel, eventId: randomUUID,
    service: { sessionVersion: () => 1, get: async () => progress, save: async (bookId, input) => {
      writes.push(input); return { item: { ...progress, bookId, revision: input.expectedRevision + 1 } };
    } } });
  tracker.schedule(location); await timer.run();
  assert.equal(writes.length, 1); assert.equal(writes[0].expectedRevision, 1);
});

test('unmount and Strict Mode cleanup cancel pending checkpoints without requests', async () => {
  const timer = clock(); let writes = 0, reads = 0;
  const tracker = createReadingCheckpoints({ schedule: timer.schedule, cancel: timer.cancel, eventId: randomUUID,
    service: { sessionVersion: () => 1, get: async () => { reads++; return null; }, save: async () => { writes++; return { item: progress }; } } });
  const cancel = tracker.schedule(location); cancel(); assert.equal(timer.count, 0); assert.equal(reads, 0);
  const first = tracker.schedule(location); first(); tracker.schedule(location); await timer.run();
  assert.equal(reads, 1); assert.equal(writes, 1);
});

test('a late progress lookup cannot write an older location after newer navigation', async () => {
  const timer = clock(), writes = [], completed = [];
  let release, reads = 0;
  const tracker = createReadingCheckpoints({ schedule: timer.schedule, cancel: timer.cancel, eventId: randomUUID,
    service: { sessionVersion: () => 1, get: async () => ++reads === 1 ? new Promise(resolve => { release = resolve; }) : null,
      save: async (bookId, input) => { writes.push(input); return { item: { bookId, ...input, revision: 1 } }; } } });
  tracker.schedule(location, { onSuccess: item => completed.push(item) }); const old = timer.run(); await settle();
  tracker.schedule({ ...location, chapterNumber: 11 }, { onSuccess: item => completed.push(item) }); const current = timer.run();
  release(null); await old; await current;
  assert.equal(writes.length, 1); assert.equal(writes[0].chapterNumber, 11);
  assert.equal(completed.length, 1); assert.equal(completed[0].chapterNumber, 11);
});

test('in-flight writes finish before the newest pending checkpoint and cannot overwrite it later', async () => {
  const timer = clock(), writes = [], completed = [];
  let release, stored = null;
  const tracker = createReadingCheckpoints({ schedule: timer.schedule, cancel: timer.cancel, eventId: randomUUID,
    service: { sessionVersion: () => 1, get: async () => stored, save: async (bookId, input) => {
      writes.push(input);
      if (writes.length === 1) await new Promise(resolve => { release = resolve; });
      stored = { bookId, chapterNumber: input.chapterNumber, verseNumber: input.verseNumber, revision: input.expectedRevision + 1 };
      return { item: stored };
    } } });
  tracker.schedule(location, { onSuccess: item => completed.push(item) }); const old = timer.run(); await settle();
  tracker.schedule({ ...location, chapterNumber: 11 }, { onSuccess: item => completed.push(item) }); const current = timer.run();
  assert.equal(writes.length, 1); release(); await old; await current;
  assert.equal(writes.length, 2); assert.equal(writes[1].expectedRevision, 1);
  assert.equal(stored.chapterNumber, 11); assert.equal(stored.revision, 2); assert.equal(completed.length, 1);
});

test('version conflicts show an error and require a fresh deliberate retry instead of overwriting another device', async () => {
  const timer = clock(), errors = []; let writes = 0;
  const tracker = createReadingCheckpoints({ schedule: timer.schedule, cancel: timer.cancel, eventId: randomUUID,
    service: { sessionVersion: () => 1, get: async () => ({ ...progress, chapterNumber: 9 }), save: async () => {
      writes++; throw Object.assign(new Error('Progress changed.'), { status: 409 });
    } } });
  tracker.schedule(location, { onError: error => errors.push(error) }); await timer.run();
  assert.equal(writes, 1); assert.equal(errors[0].status, 409); assert.equal(timer.count, 0);
  tracker.schedule(location, { onError: error => errors.push(error) }); await timer.run(); assert.equal(writes, 2);
});

test('session changes during a progress read cannot write a former session\'s location into a new account', async () => {
  const timer = clock(), errors = []; let release, version = 1, writes = 0;
  const tracker = createReadingCheckpoints({ schedule: timer.schedule, cancel: timer.cancel, eventId: randomUUID,
    service: { sessionVersion: () => version, get: async () => new Promise(resolve => { release = resolve; }), save: async () => { writes++; return { item: progress }; } } });
  tracker.schedule(location, { onError: error => errors.push(error) }); const pending = timer.run(); await settle();
  version++; release(null); await pending;
  assert.equal(writes, 0); assert.equal(errors[0].status, 401);
});

test('expired reading authentication clears the existing session and safe conflict messages remain usable', async () => {
  let count = 0, status = 409;
  const auth = createAuthService(createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async url => {
    if (url.pathname.endsWith('/login')) return Response.json(loginResponse());
    count++; return Response.json({ success: false, message: 'Reading progress changed.' }, { status });
  } }));
  const service = createReadingService(auth); await auth.login({ email: user.email, password: 'Synthetic' });
  await assert.rejects(service.save('freedom', { ...location, expectedRevision: 0, eventId: randomUUID() }), error => error.status === 409 && error.message === 'Reading progress changed.');
  status = 401; await assert.rejects(service.history(), { status: 401 }); await assert.rejects(service.list(), { status: 401 }); assert.equal(count, 2);
});

test('continue/history/checkpoint screens preserve layout, resume addresses, empty states and login guidance', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const { ContinueReadingContent } = await server.ssrLoadModule('/src/components/reading/ContinueReading.jsx');
    const { default: History } = await server.ssrLoadModule('/src/components/reading/ReadingHistory.jsx');
    const { default: Progress } = await server.ssrLoadModule('/src/components/reading/ReadingProgress.jsx');
    const { default: Prompt } = await server.ssrLoadModule('/src/features/reader/components/LibraryLoginPrompt.jsx');
    const render = (Component, props, path = '/reading/history') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    const resume = render(ContinueReadingContent, { items: [progress] }); assert.ok(resume.includes('Continue reading: Freedom 10:14')); assert.ok(resume.includes('href="/testament/freedom/10/14"'));
    const empty = render(ContinueReadingContent, { items: [] }); assert.ok(empty.includes('No reading position saved')); assert.ok(empty.includes('/testament/inquiry/1'));
    const book = render(ContinueReadingContent, { items: [], bookId: 'freedom' }); assert.ok(book.includes('/testament/freedom/1')); assert.ok(book.includes('bookId=freedom'));
    const historyHtml = render(History, { items: [history], pagination, onPage: () => {} });
    assert.ok(historyHtml.includes('/testament/freedom/10/14')); assert.ok(historyHtml.includes('2026-10-24 12:00:00 UTC')); assert.ok(historyHtml.includes('1 visits'));
    const emptyHistory = render(History, { items: [], pagination: { ...pagination, total: 0, pages: 0 }, onPage: () => {} }); assert.ok(emptyHistory.includes('No reading history here yet'));
    const route = render(Routes, {}); assert.ok(route.includes('Reading history')); assert.ok(route.includes('Loading content'));
    assert.equal((route.match(/<main\b/g) ?? []).length, 1); assert.equal((route.match(/<h1\b/g) ?? []).length, 1);
    const chapter = render(Routes, {}, '/testament/freedom/10/14'); assert.ok(chapter.includes('Responsibility is the shadow cast by freedom.'));
    assert.match(chapter, /<li[^>]+id="[^"]+-verse-14"><button[^>]+aria-pressed="true"/);
    const saving = render(Progress, { location }); assert.ok(saving.includes('Saving reading position after navigation settles'));
    const prompt = render(Prompt, { action: 'view your private reading history' }); assert.ok(prompt.includes('/login')); assert.ok(prompt.includes('view your private reading history'));
  } finally { await server.close(); }
});
