import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('homepage reading circles stack on small screens and link to the implemented circles page', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { default: CommunitySection } = await server.ssrLoadModule('/src/features/home/components/CommunitySection.jsx');
    const markup = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(CommunitySection)));
    assert.match(markup, /grid-cols-1[^"]*lg:grid-cols-/);
    assert.match(markup, /min-w-0/);
    assert.match(markup, /Community &amp; Reading Circles/);
    assert.equal((markup.match(/href="\/community\/reading-circles"/g) ?? []).length, 4);
    assert.match(markup, /min-h-11 w-full/);
  } finally { await server.close(); }
});
