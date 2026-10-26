import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createApiClient } from '../src/services/api/client.js';
import { createAuthService } from '../src/services/auth.service.js';
import { createBookmarksService } from '../src/services/bookmarks.service.js';
import { createNotesService } from '../src/services/notes.service.js';
import { noteContentError, resolveLibraryVerses, verseLink } from '../src/services/personalLibrary.js';
const user = { id: 'a'.repeat(24), email: 'synthetic@example.test', displayName: 'Reader', role: 'user', emailVerified: false, isActive: true };
const bookmark = { id: 'b'.repeat(24), verseId: 'freedom:10:14', createdAt: '2026-10-24T10:00:00.000Z' };
const note = { ...bookmark, content: '  Exact\nprivate text <script>alert(1)</script>  ', updatedAt: bookmark.createdAt };
const pagination = { page: 1, limit: 20, pages: 1, total: 1 };
const loginResponse = () => ({ success: true, data: { user, accessToken: 'synthetic-access', expiresIn: 900 } });

test('private services reuse in-memory authentication, exact text, encoded addresses and JSON DELETE with CSRF', async () => {
  const calls = [];
  const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.pathname.endsWith('/login')) return Response.json(loginResponse());
    const item = url.pathname.startsWith('/api/notes') ? note : bookmark;
    const list = init.method === 'GET' && ['/api/notes', '/api/bookmarks'].includes(url.pathname);
    return Response.json({ success: true, data: list ? { items: [item], pagination } : { item } });
  } });
  const auth = createAuthService(client), bookmarks = createBookmarksService(auth), notes = createNotesService(auth);
  await assert.rejects(bookmarks.list(), { status: 401 }); assert.equal(calls.length, 0);
  await auth.login({ email: user.email, password: 'Synthetic' });
  const signal = new AbortController().signal;
  assert.deepEqual(await bookmarks.save(bookmark.verseId, { signal }), bookmark);
  assert.deepEqual(await bookmarks.list({ page: 1, limit: 20, verseId: bookmark.verseId }, { signal }), { items: [bookmark], pagination });
  await bookmarks.remove(bookmark.verseId, { signal });
  assert.deepEqual(await notes.create({ verseId: note.verseId, content: note.content, userId: 'must not send' }, { signal }), note);
  await notes.get(note.id, { signal }); await notes.list({}, { signal });
  await notes.update(note.id, { content: note.content, verseId: 'inquiry:1:1' }, { signal });
  await notes.remove(note.id, { signal });
  for (const { init } of calls.slice(1)) {
    assert.equal(init.credentials, 'include'); assert.equal(init.signal, signal);
    assert.equal(init.headers.Authorization, 'Bearer synthetic-access');
    assert.equal(init.headers['X-CSRF-Protection'], '1');
    if (init.method !== 'GET') assert.equal(init.headers['Content-Type'], 'application/json');
    if (init.method === 'DELETE') assert.equal(init.body, '{}');
    assert.ok(!init.body?.includes('userId'));
  }
  assert.equal(calls[3].url.pathname, '/api/bookmarks/freedom%3A10%3A14');
  assert.equal(calls[2].url.searchParams.get('verseId'), bookmark.verseId);
  assert.deepEqual(JSON.parse(calls[4].init.body), { verseId: note.verseId, content: note.content });
  assert.deepEqual(JSON.parse(calls[7].init.body), { content: note.content });
  assert.equal(auth.accessToken, undefined);
  for (const path of ['https://attacker.test/api/notes', '/api/notes/../users/me', '/api/notes?userId=x', '/api/users/me'])
    await assert.rejects(auth.privateRequest('get', path), { code: 'INVALID_INPUT' });
  assert.throws(() => notes.get('../other'), { code: 'INVALID_INPUT' });
});

test('private response validation rejects ownership/credential leaks and malformed dates, addresses and content', async () => {
  for (const item of [{ ...note, user: user.id }, { ...note, passwordHash: 'never expose' }, { ...note, createdAt: 'bad' },
    { ...note, verseId: 'freedom:010:14' }, { ...note, content: '   ' }, { ...note, content: 'x'.repeat(5001) }]) {
    const auth = { privateRequest: async () => ({ success: true, data: { item } }) };
    await assert.rejects(createNotesService(auth).get(note.id), { code: 'INVALID_RESPONSE' });
  }
  const bad = createBookmarksService({ privateRequest: async () => ({ success: true, data: { items: [bookmark], pagination: { ...pagination, limit: 5000 } } }) });
  await assert.rejects(bad.list(), { code: 'INVALID_RESPONSE' });
});

test('late private responses cannot reappear after logout or clear a newer login session', async () => {
  let release, defer = true;
  const auth = createAuthService({
    post: async () => loginResponse(),
    get: async () => defer ? new Promise(resolve => { release = resolve; }) : ({ success: true, data: { items: [bookmark], pagination } }),
  });
  const bookmarks = createBookmarksService(auth);
  await auth.login({ email: user.email, password: 'Synthetic' });
  const pending = bookmarks.list();
  await auth.logout(); await auth.login({ email: user.email, password: 'New Synthetic' });
  release({ success: true, data: { items: [bookmark], pagination } });
  await assert.rejects(pending, { status: 401 });
  defer = false; assert.deepEqual((await bookmarks.list()).items, [bookmark]);
});

test('private service errors preserve validation feedback and clear expired authentication', async () => {
  let status = 400, gets = 0;
  const auth = createAuthService(createApiClient({ baseUrl: 'https://api.example.test', fetchImpl: async (url) => {
    if (url.pathname.endsWith('/login')) return Response.json(loginResponse());
    gets++; return Response.json({ success: false, message: 'Safe library error.' }, { status });
  } }));
  const notes = createNotesService(auth);
  await auth.login({ email: user.email, password: 'Synthetic' });
  await assert.rejects(notes.list(), error => error.status === 400 && error.message === 'Safe library error.');
  status = 401; await assert.rejects(notes.list(), { status: 401 });
  await assert.rejects(notes.list(), { status: 401 }); assert.equal(gets, 2);
});

test('note validation preserves authored whitespace and measures the documented character limit', () => {
  for (const content of ['A', '  Spaced\n\ttext  ', 'x'.repeat(5000), '<script>plain text</script>']) assert.equal(noteContentError(content), '');
  for (const content of ['', ' \n\t ', 'x'.repeat(5001), null, 1, {}]) assert.ok(noteContentError(content));
  assert.equal(verseLink(bookmark.verseId), '/testament/freedom/10/14');
});

test('saved records resolve live canonical references once each and retain unresolved/error states', async () => {
  const calls = [];
  const items = [{ ...bookmark }, { ...note, id: 'c'.repeat(24) }, { ...bookmark, verseId: 'inquiry:31:4' }, { ...bookmark, verseId: 'inquiry:1:1' }];
  const resolved = await resolveLibraryVerses(items, {}, { getVerse: async (book, chapter, number) => {
    calls.push([book, chapter, number]);
    if (chapter === 31) return { status: 'missing_source_text' };
    if (book === 'inquiry') throw new Error('Synthetic unavailable');
    return { text: 'Resolved manuscript text' };
  } });
  assert.equal(calls.length, 3); assert.equal(resolved[0].verse.text, 'Resolved manuscript text');
  assert.equal(resolved[1].content, note.content); assert.equal(resolved[2].verse.text, undefined);
  assert.equal(resolved[2].verse.status, 'missing_source_text'); assert.ok(resolved[3].verseError);
  assert.equal(items[0].verse, undefined);
  const real = await resolveLibraryVerses([bookmark]);
  assert.equal(real[0].verse.text, 'Responsibility is the shadow cast by freedom.');
});

test('reader, library routes, private cards and editor render existing structure and escape authored HTML', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const load = async path => (await server.ssrLoadModule(path)).default;
    const Routes = await load('/src/routes/AppRoutes.jsx');
    const Editor = await load('/src/components/notes/NoteEditor.jsx');
    const Card = await load('/src/components/notes/NoteCard.jsx');
    const Saved = await load('/src/components/reading/SavedVerseCard.jsx');
    const Controls = await load('/src/features/reader/components/ReaderControls.jsx');
    const Prompt = await load('/src/features/reader/components/LibraryLoginPrompt.jsx');
    const render = (Component, props, path = '/reading/notes') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    for (const [path, title] of [['/reading/notes', 'Private notes'], ['/reading/saved-verses', 'Saved verses']]) {
      const html = render(Routes, {}, path); assert.ok(html.includes(title)); assert.ok(html.includes('Loading content'));
      assert.equal((html.match(/<main\b/g) ?? []).length, 1); assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    }
    const editor = render(Editor, { initialContent: note.content, onSave: async () => {} });
    assert.ok(editor.includes('maxLength="5000"')); assert.ok(editor.includes('Only you can see this note'));
    assert.ok(editor.includes('&lt;script&gt;')); assert.ok(!editor.includes('<script>')); assert.ok(editor.includes('name="content"'));
    const card = render(Card, { item: { ...note, verse: { text: 'Canonical text' } } });
    for (const text of ['Canonical text', 'Edit note', 'Delete note', '/testament/freedom/10/14', 'whitespace-pre-wrap', '&lt;script&gt;']) assert.ok(card.includes(text), text);
    const unresolved = render(Saved, { item: { ...bookmark, verse: { status: 'missing_source_text' } } });
    assert.ok(unresolved.includes('Source text is unresolved')); assert.ok(unresolved.includes('Remove saved verse'));
    const error = render(Saved, { item: { ...bookmark, verseError: 'Passage unavailable' } }); assert.ok(error.includes('Passage unavailable'));
    const controls = render(Controls, { selectedVerse: { canonicalId: bookmark.verseId, bookSlug: 'freedom', chapterNumber: 10, number: 14 } });
    assert.ok(controls.includes('/reading/saved-verses')); assert.ok(controls.includes('/reading/notes')); assert.ok(controls.includes('/testament/freedom/10/14'));
    const prompt = render(Prompt, {}); assert.ok(prompt.includes('href="/login"')); assert.ok(prompt.includes('keep private notes'));
  } finally { await server.close(); }
});
