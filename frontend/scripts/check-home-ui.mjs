import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import books from "../src/data/books.js";
import { questions } from "../src/data/questions.js";
import paths from "../src/data/paths.js";
import { dialogueCards } from "../src/data/dialogueCards.js";
import essaysSection from "../src/data/essaysSection.js";

// Use the app's Vite transforms, including JSX and asset imports.
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { default: App } = await server.ssrLoadModule("/src/App.jsx");
  const renderRoute = (pathname) => renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [pathname] }, App().props.children),
  );
  const html = renderRoute("/");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const idSet = new Set(ids);

  assert.equal((html.match(/<main\b/g) || []).length, 1, "One main landmark");
  assert.equal((html.match(/<h1\b/g) || []).length, 1, "One page heading");
  assert.equal(ids.length, idSet.size, "No duplicate element IDs");
  assert.ok(!html.includes('href="#"'), "No placeholder hash links");

  for (const [, href] of html.matchAll(/\bhref="(\/?#[^"]+)"/g)) {
    assert.ok(idSet.has(href.split("#")[1]), `Home anchor exists: ${href}`);
  }
  for (const [, references] of html.matchAll(/\baria-(?:labelledby|describedby|controls)="([^"]+)"/g)) {
    for (const reference of references.split(/\s+/)) {
      assert.ok(idSet.has(reference), `ARIA target exists: ${reference}`);
    }
  }

  assert.equal((html.match(/<section\b/g) || []).length, 9, "Nine home sections");
  assert.ok(idSet.has("sanctuary"), "Reading preview section present");
  const sanctuary = html.match(/<section[^>]*id="sanctuary"[\s\S]*?<\/section>/)?.[0];
  assert.ok(sanctuary, "Sanctuary renders inside its section");
  assert.equal((sanctuary.match(/aria-pressed="(?:true|false)"/g) || []).length, 4);
  assert.equal((sanctuary.match(/aria-pressed="true"/g) || []).length, 1);
  assert.ok(sanctuary.includes("Note 262 · Context"));
  assert.ok(sanctuary.includes("Inquiry 16:9"));
  assert.ok(sanctuary.includes("LAUNCH READING ROOM →"));
  // Render each configured initial selection to cover notes, no notes, and
  // optional cross-references without claiming browser interaction coverage.
  const { readerSection } = await server.ssrLoadModule("/src/data/readerSection.js");
  const initialVerse = readerSection.preview.defaultVerse;
  assert.equal(initialVerse, "10:14");
  try {
    for (const [reference, noteNumber] of [["10:11", null], ["10:12", 261], ["10:13", null], ["10:14", 262]]) {
      readerSection.preview.defaultVerse = reference;
      const preview = renderRoute("/").match(/<section[^>]*id="sanctuary"[\s\S]*?<\/section>/)?.[0];
      const notePanel = preview.match(/<aside\b[\s\S]*?<\/aside>/)?.[0];
      const selectedButton = preview.match(/<button[^>]*aria-pressed="true"[\s\S]*?<\/button>/)?.[0];
      assert.ok(selectedButton.includes(reference), `Selected verse: ${reference}`);
      if (noteNumber === null) {
        assert.ok(notePanel.includes(readerSection.preview.emptyNote));
        assert.ok(!notePanel.includes("Note 261") && !notePanel.includes("Note 262"));
      } else {
        assert.ok(notePanel.includes(`Note ${noteNumber} · Context`));
        const verse = readerSection.preview.verses.find((entry) => entry.ref === reference);
        assert.ok(notePanel.includes(verse.note.text));
      }
      assert.equal(notePanel.includes("SEE ALSO"), reference === "10:14");
    }
  } finally {
    readerSection.preview.defaultVerse = initialVerse;
  }
  assert.equal((html.match(/<article\b/g) || []).length, books.length + questions.length + paths.length + dialogueCards.length + essaysSection.essays.length);
  const essays = html.match(/<section[^>]*id="essays"[\s\S]*?<\/section>/)?.[0];
  assert.ok(essays, "Essays render inside their labelled section");
  for (const essay of essaysSection.essays) {
    assert.ok(essays.includes(essay.title), `Essay rendered: ${essay.id}`);
    assert.ok(essays.includes(essay.status));
  }
  if (essaysSection.essays.every((essay) => essay.href === null)) {
    assert.ok(!/<a\b|<button\b/.test(essays), "Forthcoming essays do not advertise unavailable navigation");
  }
  for (const book of books) {
    assert.ok(html.includes(`Book of ${book.title}`), `Book rendered: ${book.title}`);
    assert.ok(html.includes(`aria-label="Explore the Book of ${book.title}"`));
  }
  for (const path of paths) {
    const card = html.match(new RegExp(`<article[^>]*aria-labelledby="path-${path.id}-heading"[\\s\\S]*?</article>`))?.[0];
    assert.ok(card, `Path card rendered: ${path.path}`);
    assert.ok(card.includes(`Follow this path • ${path.books.length} books`));
    for (const book of path.books) assert.ok(card.includes(book.name));
  }
  for (const card of dialogueCards) {
    assert.ok(html.includes(`href="${card.href}"`), `Dialogue destination: ${card.href}`);
    assert.ok(html.includes(card.meta), `Dialogue metadata: ${card.meta}`);
    if (card.verseRef) assert.ok(html.includes(card.verseRef));
  }
  assert.ok(html.includes("<details"), "Native mobile navigation disclosure");
  assert.ok(html.includes("<summary"), "Keyboard-operable menu control");
  assert.ok(html.includes('role="tablist"'), "Featured verse tabs present");
  assert.equal((html.match(/role="tab"/g) || []).length, 3);

  for (const pathname of ["/books/1", ...dialogueCards.map((card) => card.href), "/unknown-page"]) {
    const fallback = renderRoute(pathname);
    assert.ok(fallback.includes("Page unavailable"), `Fallback for ${pathname}`);
    assert.ok(fallback.includes("Return home"), `Recovery link for ${pathname}`);
    assert.equal((fallback.match(/<main\b/g) || []).length, 1);
    assert.equal((fallback.match(/<h1\b/g) || []).length, 1);
  }

  console.log("Home UI checks passed: landmarks, headings, anchor and ARIA targets, all card collections, path counts, dialogue URLs, and unavailable-route recovery.");
  console.log("These server-render checks do not verify browser layout or interactive keyboard behavior.");
} finally {
  await server.close();
}
