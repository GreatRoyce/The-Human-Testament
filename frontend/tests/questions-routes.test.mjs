import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('question links open live question pages and chapter passages', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const { default: Navbar } = await server.ssrLoadModule('/src/components/layout/Navbar.jsx');
    const navbar = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Navbar)));
    assert.match(navbar, /Enter the Testament/);
    assert.doesNotMatch(navbar, /Create account/i);
    for (const destination of ['/welcome', '/testament', '/articles', '/questions', '/community', '/about'])
      assert.ok(navbar.includes(destination), `Expected a working navigation destination: ${destination}`);

    const renderRoute = path => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes)));
    const list = renderRoute('/questions');
    assert.match(list, /Questions worth living with/);
    assert.match(list, /belief-worth-keeping/);

    const detail = renderRoute('/questions/belief-worth-keeping');
    assert.match(detail, /What makes a belief worth keeping/);
    assert.match(detail, /Read the passages/);
    assert.match(detail, /testament\/belief\/6\/16/);
    assert.match(renderRoute('/questions/not-a-question'), /Question not found/);
    const about = renderRoute('/about');
    assert.match(about, /About The Human Testament/);
    assert.match(about, /A work of examination/);
    assert.match(about, /Mount Scene Publishing/);

    const homepage = renderRoute('/welcome');
    assert.match(homepage, /questions\/why-do-i-believe/);
    assert.doesNotMatch(homepage, /Question pages are coming soon/);
  } finally { await server.close(); }
});
