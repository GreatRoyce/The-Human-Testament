import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('reader dashboard welcomes the authenticated reader and exposes implemented destinations', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: ReaderDashboard } = await server.ssrLoadModule('/src/pages/Home/ReaderDashboard.jsx');
    const markup = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(ReaderDashboard, { user: { displayName: 'Ada Reader' } })));
    assert.match(markup, /Welcome, Ada Reader/);
    assert.match(markup, /Continue reading/);
    assert.match(markup, /Personal library/);
    assert.match(markup, /reading\/saved-verses/);
    assert.match(markup, /reading\/notes/);
    assert.match(markup, /reading\/history/);
    assert.match(markup, /Articles and essays/);
    assert.match(markup, /Reading circles/);
    assert.doesNotMatch(markup, /Saved verses<\/span><span[^>]*>0/);
    const { default: Routes } = await server.ssrLoadModule('/src/routes/AppRoutes.jsx');
    const renderRoute = path => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes)));
    assert.match(renderRoute('/'), /What does it mean to be/);
    assert.match(renderRoute('/welcome'), /What does it mean to be/);
    assert.equal(renderRoute('/dashboard'), '', 'The dashboard is protected when there is no session.');
    assert.equal(renderRoute('/reading/notes'), '', 'Private library content is protected when there is no session.');
  } finally { await server.close(); }
});
