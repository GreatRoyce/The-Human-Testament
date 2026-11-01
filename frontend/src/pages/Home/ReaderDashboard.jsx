import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { readingService, readingLocationLabel, readingLocationUrl } from '../../services/reading.service.js';
import { bookmarksService } from '../../services/bookmarks.service.js';
import { notesService } from '../../services/notes.service.js';
import { useBooks } from '../../features/testament/hooks/useBooks.js';
import ResourceState from '../../components/shared/ResourceState.jsx';

function useLibraryCount(service, key) {
  const load = useCallback(async options => service.list({ page: 1, limit: 1 }, options), [service]);
  return useResource(load, `dashboard:${key}`);
}

function LibraryLink({ label, to, resource }) {
  const count = resource.data?.pagination?.total;
  return <Link to={to} className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-3 text-forest underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
    <span>{label}</span>
    <span aria-label={resource.error ? `${label} count unavailable` : undefined} className="font-mono text-sm text-muted">
      {resource.loading ? '…' : resource.error ? '—' : count}
    </span>
  </Link>;
}

export default function ReaderDashboard({ user }) {
  const progressLoad = useCallback(options => readingService.list(options), []);
  const progress = useResource(progressLoad, 'dashboard:reading-progress');
  const bookmarks = useLibraryCount(bookmarksService, 'bookmarks');
  const notes = useLibraryCount(notesService, 'notes');
  const books = useBooks();
  const latest = progress.data?.reduce((current, item) =>
    !current || new Date(item.updatedAt) > new Date(current.updatedAt) ? item : current, null);

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-ivory pb-16 pt-24">
    <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8">
      <header className="mb-9 border-b border-border pb-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">Your reading desk</p>
        <h1 className="mt-2 font-serif text-3xl text-forest sm:text-4xl">Welcome, {user.displayName}</h1>
        <p className="mt-2 max-w-reading text-sm leading-7 text-muted">Pick up where you left off, or follow a new line of inquiry.</p>
      </header>

      <section aria-labelledby="continue-reading-heading" className="grid gap-6 border-b border-border pb-8 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div>
          <h2 id="continue-reading-heading" className="font-serif text-2xl text-forest">Continue reading</h2>
          {progress.error?.status === 401 ? <p role="status" className="mt-4 text-sm leading-7 text-muted">Your session has expired. Sign in again to restore your saved reading position.</p> :
            <ResourceState resource={progress}>
              {latest ? <div className="mt-4 space-y-3">
                <p className="text-sm text-muted">{readingLocationLabel(latest)}</p>
                <p className="text-sm text-muted">Last read <time dateTime={latest.updatedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(latest.updatedAt))}</time></p>
                <Link to={readingLocationUrl(latest)} className="inline-flex min-h-12 items-center rounded-sm bg-forest px-5 py-3 text-sm font-semibold text-white hover:bg-forest-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">Continue reading</Link>
              </div> : <div className="mt-4 space-y-3">
                <p className="max-w-reading text-sm leading-7 text-muted">Your reading position will appear here after you begin reading while signed in.</p>
                <Link to="/testament" className="inline-flex min-h-12 items-center rounded-sm bg-forest px-5 py-3 text-sm font-semibold text-white hover:bg-forest-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">Explore the ten books</Link>
              </div>}
            </ResourceState>}
        </div>
        <aside aria-labelledby="personal-library-heading" className="md:border-l md:border-border md:pl-6">
          <h2 id="personal-library-heading" className="font-serif text-xl text-forest">Personal library</h2>
          <div className="mt-2">
            <LibraryLink label="Saved verses" to="/reading/saved-verses" resource={bookmarks} />
            <LibraryLink label="Private notes" to="/reading/notes" resource={notes} />
            <Link to="/reading/history" className="flex min-h-14 items-center border-b border-border py-3 text-forest underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">Reading history</Link>
          </div>
        </aside>
      </section>

      <section aria-labelledby="explore-heading" className="grid gap-8 border-b border-border py-8 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div>
          <h2 id="explore-heading" className="font-serif text-2xl text-forest">Explore the Testament</h2>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <Link to="/testament" className="text-forest underline underline-offset-4">All ten books</Link>
            <Link to="/search" className="text-forest underline underline-offset-4">Search the manuscript</Link>
            <Link to="/testament/materials" className="text-forest underline underline-offset-4">Supporting notes and context</Link>
            <Link to="/testament/materials#glossary" className="text-forest underline underline-offset-4">Glossary and cross-references</Link>
          </div>
          <ResourceState resource={books} empty={books.data?.length === 0} emptyMessage="Book listings are temporarily unavailable.">
            {books.data && <ul className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {books.data.map(book => <li key={book.slug}><Link to={`/testament/${book.slug}`} className="text-sm text-forest underline underline-offset-4">{book.title}</Link></li>)}
            </ul>}
          </ResourceState>
        </div>
        <aside className="md:border-l md:border-border md:pl-6">
          <h2 className="font-serif text-xl text-forest">Read with others</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Link to="/articles" className="block text-forest underline underline-offset-4">Articles and essays</Link>
            <Link to="/community/discussions" className="block text-forest underline underline-offset-4">Discussions</Link>
            <Link to="/community/reading-circles" className="block text-forest underline underline-offset-4">Reading circles</Link>
            <Link to="/notifications" className="block text-forest underline underline-offset-4">Notifications</Link>
          </div>
        </aside>
      </section>
    </div>
  </main>;
}
