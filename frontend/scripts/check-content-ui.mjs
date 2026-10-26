import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false, ws: false }, appType: 'spa' });
try {
  const { default: AppRoutes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
  const { bookService } = await server.ssrLoadModule('/src/features/testament/services/bookService.js');
  const { chapterService } = await server.ssrLoadModule('/src/features/testament/services/chapterService.js');
  const renderRoute = (route) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [route] }, createElement(AppRoutes)));
  let routeCount = 0;
  function checkRoute(route, expected) {
    const html = renderRoute(route);
    assert.ok(html.includes(expected), `${route} renders ${expected}`);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1, `One main at ${route}`);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `One h1 at ${route}`);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, new Set(ids).size, `Unique IDs at ${route}`);
    for (const [, references] of html.matchAll(/\baria-(?:labelledby|describedby|controls)="([^"]+)"/g)) {
      for (const reference of references.split(/\s+/)) assert.ok(ids.includes(reference), `ARIA target ${reference} at ${route}`);
    }
    routeCount += 1;
    return html;
  }
  checkRoute('/testament', 'Book of Inquiry');
  for (const book of await bookService.getBooks()) {
    checkRoute(`/testament/${book.slug}`, book.description);
    for (const chapter of await chapterService.getChapters(book.slug)) {
      const content = await chapterService.getChapter(book.slug, chapter.number);
      checkRoute(`/testament/${book.slug}/${chapter.number}`, `CHAPTER ${chapter.number}`);
      // Full corpus data is checked separately; render first/last verse routes in
      // every chapter and every blank source reference to exercise the UI states.
      const selectedVerses = [...new Map([content.verses[0], content.verses.at(-1), ...content.verses.filter(verse => verse.status === 'missing_source_text')].map(verse => [verse.number, verse])).values()];
      for (const verse of selectedVerses) {
        const expected = verse.text ? renderToStaticMarkup(createElement('span', null, verse.text)).slice(6, -7) : 'Source text is missing';
        const html = checkRoute(`/testament/${book.slug}/${chapter.number}/${verse.number}`, expected);
        const selected = html.match(/<button[^>]*aria-pressed="true"[\s\S]*?<\/button>/)?.[0];
        assert.ok(selected?.includes(`${chapter.number}:${verse.number}`));
      }
    }
  }
  checkRoute('/testament/existence', 'Chapter 4');
  checkRoute('/testament/materials', 'Self-Worth');
  checkRoute('/testament/freedom/10/999', 'This verse is not available');
  const emptySearch = checkRoute('/search', 'Enter a word, phrase, term or verse reference to search the manuscript.');
  for (const field of ['q', 'type', 'book', 'chapter', 'limit']) assert.ok(emptySearch.includes(`name="${field}"`), `Search filter ${field} is available`);
  checkRoute('/search?q=responsibility', 'Freedom 10:14');
  checkRoute('/search?q=unfindable-phrase-987654', 'No manuscript results on this page. Try another query, filter or page.');
  for (const route of ['/contact', '/privacy', '/terms']) checkRoute(route, 'Return to the home page');
  checkRoute('/unknown', 'Page unavailable');
  // Unknown mock addresses settle to NOT_FOUND asynchronously in the hook.
  for (const route of ['/testament/unknown', '/testament/freedom/999', '/testament/freedom/invalid']) checkRoute(route, 'Loading content');

  // Check all relative source imports, including modules outside the active route bundle.
  let importCount = 0;
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { await inspect(path); continue; }
      if (!/\.(?:js|jsx|ts)$/.test(path)) continue;
      const source = await readFile(path, 'utf8');
      for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) {
        const target = resolve(dirname(path), specifier);
        const candidates = [target, ...['.js', '.jsx', '.d.ts', '/index.js'].map((extension) => target + extension)];
        const found = (await Promise.all(candidates.map(async (candidate) => {
          try { return (await stat(candidate)).isFile(); } catch { return false; }
        }))).some(Boolean);
        assert.ok(found, `Import resolves: ${path} -> ${specifier}`);
        importCount += 1;
      }
      if (/[/\\](?:components|pages)[/\\]/.test(path)) {
        assert.ok(!/\bfetch\s*\(/.test(source), `No transport calls in UI: ${path}`);
        assert.ok(!/from\s*['"][^'"]*data\/mock/.test(source), `UI does not import content mocks: ${path}`);
      }
    }
  }
  await inspect(resolve(root, 'src'));
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const route of ['/', '/testament', '/testament/freedom', '/testament/freedom/10', '/testament/freedom/10/14', '/books/2', '/search?q=responsibility', '/contact', '/unknown']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, `Vite serves direct navigation to ${route}`);
    assert.ok((await response.text()).includes('id="root"'));
  }
  for (const path of ['/src/main.jsx', '/src/routes/AppRoutes.jsx', '/src/features/home/components/Sanctuary.jsx']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, `Vite transforms ${path}`);
    assert.ok((await response.text()).includes('import'));
  }
  console.log(`Content UI checks passed: ${routeCount} route renders; ${importCount} relative source imports; all chapters, sampled verse selections, missing source text, manuscript materials, legal routes, and fallback.`);
  console.log('Running Vite server checks passed: 9 direct URL requests and 3 transformed JavaScript modules.');
  console.log('Server-render checks do not verify effects, redirects, viewport layout, or browser keyboard interactions.');
} finally { await server.close(); }
