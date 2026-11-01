import { Link } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import { site } from '../../data/site.js';
import { manuscriptCounts } from '../../services/manuscriptContent.js';

const books = [
  'Inquiry', 'Freedom', 'Power', 'Society', 'Identity',
  'Relationships', 'Humanity', 'Existence', 'Belief', 'Purpose',
];

export default function About() {
  return <ContentPage title={`About ${site.name}`}>
    <div className="max-w-reading space-y-8">
      <section aria-labelledby="about-work-heading">
        <h2 id="about-work-heading" className="mb-3 font-serif text-2xl text-forest">A work of examination</h2>
        <p className="text-sm leading-7 text-muted">
          The Human Testament is a work of wisdom in ten books, written in the form of ancient wisdom literature.
          It is not a history, revelation, or doctrine owed obedience. It examines the life we inherit, the customs
          we preserve, the beliefs we defend, and the meanings we give to existence.
        </p>
        <p className="mt-4 text-sm leading-7 text-muted">
          Its verses invite reflection rather than assent. Read them against reason, experience, and the life you
          have observed. Nothing here is protected from scrutiny, not even the book itself.
        </p>
      </section>

      <section aria-labelledby="about-structure-heading">
        <h2 id="about-structure-heading" className="mb-3 font-serif text-2xl text-forest">Ten paths of inquiry</h2>
        <p className="mb-4 text-sm leading-7 text-muted">
          Across {manuscriptCounts.books} books and {manuscriptCounts.chapters} chapters, the work moves from Inquiry
          to Purpose and considers the questions raised by each subject.
        </p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {books.map((book, index) => <li key={book} className="border-b border-border py-2 text-sm text-charcoal">
            <span className="mr-3 font-mono text-xs text-bronze-ink">{String(index + 1).padStart(2, '0')}</span>
            {book}
          </li>)}
        </ol>
      </section>

      <section aria-labelledby="about-reading-heading">
        <h2 id="about-reading-heading" className="mb-3 font-serif text-2xl text-forest">How to read</h2>
        <p className="text-sm leading-7 text-muted">
          Read a verse at a time or a book at a time. Footnotes clarify difficult terms and open further reflection;
          cross-references connect passages across the ten books. What is inherited may be worth keeping, but not
          merely because it was inherited.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link to="/testament" className="text-forest underline underline-offset-4">Explore the Testament</Link>
          <Link to="/questions" className="text-forest underline underline-offset-4">Browse the questions</Link>
          <Link to="/testament/materials" className="text-forest underline underline-offset-4">Notes and references</Link>
        </div>
      </section>

      <section aria-labelledby="about-credits-heading" className="border-t border-border pt-6">
        <h2 id="about-credits-heading" className="mb-3 font-serif text-2xl text-forest">About the book</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-mono text-xs uppercase text-muted">Author</dt><dd className="mt-1 text-charcoal">{site.author}</dd></div>
          <div><dt className="font-mono text-xs uppercase text-muted">Publisher</dt><dd className="mt-1 text-charcoal">{site.publisher}, {site.location}</dd></div>
        </dl>
      </section>
    </div>
  </ContentPage>;
}
