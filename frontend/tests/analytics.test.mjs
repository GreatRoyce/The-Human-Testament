import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createAnalyticsTracker, publicAnalyticsPath } from '../src/services/analyticsTracker.js';
import { createAuthService } from '../src/services/auth.service.js';
import { createAnalyticsService } from '../src/services/analytics.service.js';
import { createApiClient } from '../src/services/api/client.js';
const DAY = 86400000;
function storage() { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map }; }
function runtime() { return { crypto: { randomUUID }, localStorage: storage(), sessionStorage: storage(), navigator: {}, document: { referrer: 'https://search.example.test/results?q=private#secret' } }; }
const user = { id: 'a'.repeat(24), email: 'reader@example.test', displayName: 'Reader', role: 'user', emailVerified: true, isActive: true };
const login = () => ({ success: true, data: { user, accessToken: 'synthetic-only', expiresIn: 900 } });
const emptyData = () => ({ range: { start: '2026-10-20', end: '2026-10-26', interval: 'day', timezone: 'UTC' },
  metrics: Object.fromEntries(['visits', 'estimatedVisitors', 'pageViews'].map(key => [key, { current: 0, previous: 0, changePercent: null }])),
  pages: [], contentTypes: [], referrals: [], activity: [], trends: [],
  coverage: { availableFrom: '2026-10-26T00:00:00.000Z', through: '2026-10-26T12:00:00.000Z', partial: true, previousPartial: true, empty: true, retentionDays: 180 } });
test('analytics is opt-in, honors DNT/GPC and clears identifiers on withdrawal', () => {
  const win = runtime(), events = [], tracker = createAnalyticsTracker({ enabled: true, runtime: () => win, send: body => events.push(body) });
  tracker.track('/'); assert.equal(events.length, 0); assert.equal(win.localStorage.map.size, 0); assert.equal(win.sessionStorage.map.size, 0);
  tracker.setConsent(true); tracker.track('/'); assert.equal(events.length, 1); assert.equal(events[0].referral, 'search.example.test');
  assert.equal(JSON.stringify(events).includes('private'), false); assert.equal(Object.hasOwn(events[0], 'userId'), false);
  tracker.setConsent(false); tracker.track('/testament'); assert.equal(events.length, 1);
  assert.equal(win.localStorage.getItem('htt.analytics.visitor'), null); assert.equal(win.sessionStorage.map.size, 0);
  for (const signal of ['doNotTrack', 'globalPrivacyControl']) {
    win.navigator[signal] = signal === 'doNotTrack' ? '1' : true; tracker.setConsent(true); tracker.track('/testament');
    assert.equal(tracker.preference(), 'blocked'); assert.equal(events.length, 1); assert.equal(win.localStorage.getItem('htt.analytics.visitor'), null); delete win.navigator[signal];
  }
  win.doNotTrack = '1'; tracker.track('/'); assert.equal(events.length, 1);
  const disabled = createAnalyticsTracker({ enabled: false, runtime: () => win, send: body => events.push(body) }); disabled.setConsent(true); disabled.track('/'); assert.equal(events.length, 1);
});
test('SPA pathname transitions count once under StrictMode/remounts and revisits count again', () => {
  const win = runtime(), events = [], tracker = createAnalyticsTracker({ enabled: true, runtime: () => win, send: body => events.push(body) });
  tracker.setConsent(true);
  for (const path of ['/', '/', '/', '/testament', '/testament', '/', '/account/settings', '/']) tracker.track(path);
  assert.deepEqual(events.map(x => x.path), ['/', '/testament', '/', '/']);
  assert.equal(new Set(events.map(x => x.eventId)).size, 4); assert.equal(new Set(events.map(x => x.sessionId)).size, 1); assert.equal(new Set(events.map(x => x.visitorId)).size, 1);
  for (const path of ['/reset-password?token=secret', '/search?q=private', '/#private', '/admin/analytics', '/owner/analytics', '/reading/history', '/notifications', '/community/discussions/' + 'a'.repeat(24), '/articles/mine', '/articles/write', '/articles/moderation', '/articles/mine/' + 'a'.repeat(24), 'https://attacker.test']) { assert.equal(publicAnalyticsPath(path), false, path); tracker.track(path); }
  assert.equal(events.length, 4);
  assert.equal(publicAnalyticsPath('/testament/freedom/1/1'), true); assert.equal(publicAnalyticsPath('/articles/published-essay'), true);
});
test('browser identifiers rotate after 90 days and tab sessions after 30 minutes of page-view inactivity', () => {
  let time = Date.now(); const win = runtime(), events = [], tracker = createAnalyticsTracker({ enabled: true, now: () => time, runtime: () => win, send: body => events.push(body) });
  tracker.setConsent(true); tracker.track('/'); time += 29 * 60000; tracker.track('/search');
  assert.equal(events[0].sessionId, events[1].sessionId);
  time += 30 * 60000; tracker.track('/testament'); assert.notEqual(events[1].sessionId, events[2].sessionId); assert.equal(events[0].visitorId, events[2].visitorId);
  time += 90 * DAY; tracker.track('/'); assert.notEqual(events[0].visitorId, events[3].visitorId); assert.notEqual(events[2].sessionId, events[3].sessionId);
});
test('storage, crypto and network outages never escape into navigation and do not retry or queue events', async () => {
  for (const send of [() => { throw new Error('Offline'); }, () => Promise.reject(new Error('Offline'))]) {
    const win = runtime(); let calls = 0;
    const tracker = createAnalyticsTracker({ enabled: true, runtime: () => win, send: () => { calls++; return send(); } });
    tracker.setConsent(true); assert.doesNotThrow(() => tracker.track('/')); tracker.track('/'); tracker.track('/search'); assert.equal(calls, 2);
    await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(calls, 2);
    assert.equal([...win.localStorage.map.keys()].some(key => /queue|event/.test(key)), false);
  }
  const win = runtime(); win.localStorage.getItem = () => { throw new Error('Storage blocked'); };
  const blocked = createAnalyticsTracker({ enabled: true, runtime: () => win, send: () => assert.fail('No tracking with blocked storage') });
  blocked.setConsent(true); assert.equal(blocked.preference(), 'unavailable'); assert.doesNotThrow(() => blocked.track('/'));
  win.localStorage = storage(); win.crypto.randomUUID = () => { throw new Error('Crypto unavailable'); }; blocked.setConsent(true); assert.doesNotThrow(() => blocked.track('/search'));
});
test('analytics transport uses optional bearer only at ingestion, explicit report paths and no cookies', async () => {
  const calls = []; let failIngest = false;
  const auth = createAuthService(createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.pathname.endsWith('/login')) return Response.json(login());
    if (url.pathname.endsWith('/events')) return failIngest ? Response.json({ success: false, message: 'Unavailable' }, { status: 503 }) : Response.json({ success: true, data: { accepted: true } }, { status: 202 });
    if (url.pathname.endsWith('/report')) return Response.json({ success: true, data: emptyData() });
    return Response.json({ success: true, data: { owner: false, admin: true } });
  } }));
  const body = { eventId: randomUUID(), visitorId: randomUUID(), sessionId: randomUUID(), path: '/', referral: null, consent: true };
  await auth.analyticsRequest('post', '/api/analytics/events', body);
  assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.headers.Authorization, undefined);
  const service = createAnalyticsService(auth); await assert.rejects(service.report('owner'), { status: 401 });
  await auth.login({}); await auth.analyticsRequest('post', '/api/analytics/events', body); assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer synthetic-only');
  failIngest = true; const epoch = auth.getSessionVersion(); await assert.rejects(auth.analyticsRequest('post', '/api/analytics/events', body)); assert.equal(auth.getSessionVersion(), epoch);
  assert.deepEqual(await service.report('admin', { days: '30', interval: 'week' }), emptyData());
  assert.equal(calls.at(-1).url.searchParams.get('days'), '30'); assert.equal(calls.at(-1).init.credentials, 'omit');
  assert.deepEqual(await service.capabilities(), { owner: false, admin: true });
  for (const path of ['https://attacker.test', '/api/analytics/events/secret', '/api/analytics/owner/raw', '/api/users/me']) await assert.rejects(auth.analyticsRequest('get', path), { code: 'INVALID_INPUT' });
  await assert.rejects(auth.analyticsRequest('post', '/api/analytics/admin/report', {}), { code: 'INVALID_INPUT' });
  await assert.rejects(service.report('moderator'), { code: 'INVALID_INPUT' });
});
test('reports reject raw event data and late responses cannot cross account changes', async () => {
  const invalid = createAnalyticsService({ analyticsRequest: async () => ({ success: true, data: { ...emptyData(), rawEvents: [{ visitorHash: 'secret' }] } }) });
  await assert.rejects(invalid.report('owner'), { code: 'INVALID_RESPONSE' });
  let resolvePending;
  const auth = createAuthService({ post: async () => login(), get: async () => new Promise(resolve => { resolvePending = resolve; }) });
  await auth.login({}); const request = createAnalyticsService(auth).report('owner'); await auth.logout(); await auth.login({});
  resolvePending({ success: true, data: emptyData() }); await assert.rejects(request, { status: 401 });
});
test('Owner/Admin routes and summary render real empty/partial states, safe links, trends and definitions', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const render = (Component, props, path = '/') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    const { default: Summary } = await server.ssrLoadModule('/src/components/analytics/AnalyticsSummary.jsx');
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const { default: Tracking } = await server.ssrLoadModule('/src/components/analytics/AnalyticsTracking.jsx');
    const empty = render(Summary, { data: emptyData() });
    for (const text of ['No analytics data', 'Partial data', 'Comparison unavailable', 'not exact people', 'Authenticated activity', '2026-10-20', 'Not enough traffic']) assert.ok(empty.includes(text), text);
    const data = { ...emptyData(), pages: [{ label: 'javascript:alert(1)', pageViews: 1 }, { label: '/testament', pageViews: 2 }], referrals: [{ label: '<script>unsafe</script>', pageViews: 1 }],
      trends: [{ date: '2026-10-26', visits: 2, estimatedVisitors: 1, pageViews: 3 }], coverage: { ...emptyData().coverage, partial: false, previousPartial: false, empty: false }, operations: { collectionEnabled: true, storageReady: true, retentionDays: 180 } };
    const html = render(Summary, { data }); assert.ok(html.includes('<svg')); assert.ok(html.includes('Collection operations')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('href="javascript:')); assert.ok(html.includes('href="/testament"'));
    for (const scope of ['owner', 'admin']) {
      const route = render(Routes, {}, `/${scope}/analytics`);
      assert.equal((route.match(/<main\b/g) || []).length, 1); assert.equal((route.match(/<h1\b/g) || []).length, 1);
      assert.ok(route.includes(scope === 'owner' ? 'Owner analytics' : 'Admin analytics')); assert.ok(route.includes('Last 90 days')); assert.ok(route.includes('Loading content'));
    }
    assert.equal(render(Tracking), '', 'Collection and controls are absent by default.');
  } finally { await server.close(); }
});
test('enabled analytics show an explicit opt-in control without reading browser identifiers during rendering', async () => {
  const previousFlag = process.env.VITE_ANALYTICS_ENABLED;
  process.env.VITE_ANALYTICS_ENABLED = 'true';
  let server;
  try {
    server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
    assert.equal((await server.ssrLoadModule('/src/services/analyticsTracker.js')).analyticsEnabled, true);
    const { default: Tracking } = await server.ssrLoadModule('/src/components/analytics/AnalyticsTracking.jsx');
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/testament'] }, createElement(Tracking)));
    assert.ok(html.includes('Optional analytics are')); assert.ok(html.includes('Allow analytics')); assert.ok(html.includes('Keep analytics off'));
    assert.ok(html.includes('href="/privacy"')); assert.ok(!html.includes('htt.analytics.visitor'));
  } finally { if (server) await server.close(); if (previousFlag === undefined) delete process.env.VITE_ANALYTICS_ENABLED; else process.env.VITE_ANALYTICS_ENABLED = previousFlag; }
});
