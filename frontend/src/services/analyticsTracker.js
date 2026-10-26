import { authService } from './auth.service.js';
export const analyticsEnabled = import.meta.env?.VITE_ANALYTICS_ENABLED === 'true';
const preferenceKey = 'htt.analytics.preference', visitorKey = 'htt.analytics.visitor', sessionKey = 'htt.analytics.session';
const DAY = 86400000;
export function publicAnalyticsPath(path) {
  return typeof path === 'string' && path.length <= 200 && (/^\/(?:contact|privacy|terms|search|testament(?:\/materials|\/[a-z-]+(?:\/[1-9]\d{0,2}(?:\/[1-9]\d{0,2})?)?)?|community(?:\/discussions|\/reading-circles)?|articles)?$/.test(path) ||
    (/^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && !['mine', 'write', 'moderation'].includes(path.split('/')[2])));
}
export function createAnalyticsTracker({ runtime = () => globalThis.window, enabled = analyticsEnabled, now = Date.now,
  send = body => authService.analyticsRequest('post', '/api/analytics/events', body, { signal: AbortSignal.timeout(4000) }) } = {}) {
  let lastPath;
  function blocked(win) { return win?.navigator?.globalPrivacyControl === true || [win?.navigator?.doNotTrack, win?.navigator?.msDoNotTrack, win?.doNotTrack].some(value => value === '1' || value === 'yes'); }
  function clearIds(win) { win.localStorage.removeItem(visitorKey); win.sessionStorage.removeItem(sessionKey); }
  function preference() {
    try { const win = runtime(); if (blocked(win)) { clearIds(win); return 'blocked'; } return win.localStorage.getItem(preferenceKey) === 'allow' ? 'allow' : 'deny'; }
    catch { return 'unavailable'; }
  }
  function setConsent(allow) {
    try { const win = runtime(); win.localStorage.setItem(preferenceKey, allow ? 'allow' : 'deny'); if (!allow || blocked(win)) clearIds(win); lastPath = undefined; }
    catch { /* Unavailable storage means no tracking. */ }
  }
  function track(path) {
    try {
      const win = runtime();
      if (!enabled || preference() !== 'allow') return;
      if (path === lastPath) return; lastPath = path;
      if (!publicAnalyticsPath(path)) return;
      const timestamp = now(), uuid = () => win.crypto.randomUUID();
      const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
      let visitor, session;
      try { visitor = JSON.parse(win.localStorage.getItem(visitorKey)); } catch { /* Replace corrupt analytics-only storage. */ }
      try { session = JSON.parse(win.sessionStorage.getItem(sessionKey)); } catch { /* Same. */ }
      if (!validId(visitor?.id) || !Number.isFinite(visitor.expires) || visitor.expires <= timestamp || visitor.expires > timestamp + 90 * DAY) visitor = { id: uuid(), expires: timestamp + 90 * DAY };
      if (!validId(session?.id) || !Number.isFinite(session.lastAt) || session.lastAt > timestamp || timestamp - session.lastAt >= 30 * 60000 || session.visitor !== visitor.id) session = { id: uuid(), visitor: visitor.id };
      session.lastAt = timestamp;
      win.localStorage.setItem(visitorKey, JSON.stringify(visitor)); win.sessionStorage.setItem(sessionKey, JSON.stringify(session));
      let referral = null;
      try { const hostname = new URL(win.document.referrer).hostname.toLowerCase(); if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) referral = hostname; } catch { /* Direct or unavailable. */ }
      // Query strings, fragments, titles and account data never enter the payload. No retries or offline queue.
      Promise.resolve(send({ eventId: uuid(), visitorId: visitor.id, sessionId: session.id, path, referral, consent: true })).catch(() => {});
    } catch { /* Analytics must never interrupt reading or navigation. */ }
  }
  return { track, preference, setConsent, enabled };
}
export const analyticsTracker = createAnalyticsTracker();
