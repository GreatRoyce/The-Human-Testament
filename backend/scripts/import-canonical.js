
const fs = require("node:fs");
const path = require("node:path");

const inputPath = path.join(
  __dirname,
  "../data/canonical-content.json"
);

function validateContent(content) {
  const errors = [];
  const bookSlugs = new Set();
  const bookOrders = new Set();

  if (!content.sourceVersion) {
    errors.push("sourceVersion is required.");
  }

  if (!Array.isArray(content.books)) {
    errors.push("books must be an array.");
    return errors;
  }

  for (const book of content.books) {
    if (!book.title || !book.slug || !Number.isInteger(book.order)) {
      errors.push("Every book needs title, slug, and integer order.");
      continue;
    }

    if (bookSlugs.has(book.slug)) {
      errors.push(`Duplicate book slug: ${book.slug}`);
    }
    bookSlugs.add(book.slug);

    if (bookOrders.has(book.order)) {
      errors.push(`Duplicate book order: ${book.order}`);
    }
    bookOrders.add(book.order);

    if (!Array.isArray(book.chapters)) {
      errors.push(`${book.title}: chapters must be an array.`);
      continue;
    }

    const chapterNumbers = new Set();

    for (const chapter of book.chapters) {
      if (!Number.isInteger(chapter.number) || chapter.number < 1) {
        errors.push(`${book.title}: invalid chapter number.`);
        continue;
      }

      if (chapterNumbers.has(chapter.number)) {
        errors.push(`${book.title}: duplicate chapter ${chapter.number}.`);
      }
      chapterNumbers.add(chapter.number);

      if (!Array.isArray(chapter.verses)) {
        errors.push(`${book.title} ${chapter.number}: verses must be an array.`);
        continue;
      }

      const verseNumbers = new Set();

      for (const verse of chapter.verses) {
        if (
          !Number.isInteger(verse.number) ||
          verse.number < 1 ||
          typeof verse.text !== "string" ||
          !verse.text.trim()
        ) {
          errors.push(
            `${book.title} ${chapter.number}: invalid verse data.`
          );
          continue;
        }

        if (verseNumbers.has(verse.number)) {
          errors.push(
            `${book.title} ${chapter.number}: duplicate verse ${verse.number}.`
          );
        }

        verseNumbers.add(verse.number);
      }
    }
  }

  return errors;
}

async function main() {
  if (process.argv.includes('--write')) {
    throw new Error('Canonical writes remain disabled. Explicit editorial approval, validated versioned artifacts, and a separately reviewed transactional importer are required. No database connection was opened.');
  }
  const content = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const errors = validateContent(content);

  if (errors.length) {
    console.error("Validation failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  const books = content.books;
  const chapters = books.reduce(
    (sum, book) => sum + book.chapters.length,
    0
  );
  const verses = books.reduce(
    (sum, book) =>
      sum + book.chapters.reduce(
        (chapterSum, chapter) => chapterSum + chapter.verses.length,
        0
      ),
    0
  );

  console.log("Canonical content validation passed.");
  console.log(`Source version: ${content.sourceVersion}`);
  console.log(`Books: ${books.length}`);
  console.log(`Chapters: ${chapters}`);
  console.log(`Verses: ${verses}`);
  console.log('Import approval: NOT APPROVED. Structural validation alone does not approve this input.');

  console.log('DRY RUN: MongoDB was not connected or modified. Write mode is disabled.');
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { validateContent, main };
