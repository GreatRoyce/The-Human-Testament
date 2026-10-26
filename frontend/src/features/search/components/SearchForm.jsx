import { useState } from 'react';
export default function SearchForm({ query, filters = {}, books = [], booksLoading = false, onSearch }) {
  const [book, setBook] = useState(filters.book ?? '');
  const [chapter, setChapter] = useState(filters.chapter ?? '');
  return <form onSubmit={(event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    onSearch(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')));
  }} className="my-6 flex flex-wrap items-end gap-3">
    <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-forest">
      Search the Testament
      <input defaultValue={query} name="q" type="search" required maxLength={200} className="min-h-11 w-full rounded-soft border border-border bg-white px-4 text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest" />
    </label>
    <div className="flex w-full flex-wrap items-end gap-3">
      <label className="flex min-w-0 basis-full flex-col gap-2 text-sm text-forest sm:flex-1 sm:basis-48">Content type
        <select name="type" defaultValue={filters.type ?? 'all'} className="min-h-11 rounded-soft border border-border bg-white px-3">
          <option value="all">All manuscript content</option><option value="verse">Canonical verses</option><option value="note">Supporting notes and reflections</option><option value="glossary">Glossary</option><option value="cross-reference">Cross-references</option>
        </select>
      </label>
      <label className="flex min-w-0 basis-full flex-col gap-2 text-sm text-forest sm:flex-1 sm:basis-48">Book
        <select name="book" value={book} disabled={booksLoading} onChange={event => { setBook(event.target.value); setChapter(''); }} className="min-h-11 rounded-soft border border-border bg-white px-3">
          <option value="">{booksLoading ? 'Loading books…' : 'All books'}</option>
          {books.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-sm text-forest">Chapter
        <input type="number" name="chapter" min={1} max={books.find(item => item.slug === book)?.chapterCount ?? 10000} step={1} disabled={!book} value={chapter} onChange={event => setChapter(event.target.value)} className="min-h-11 w-24 rounded-soft border border-border bg-white px-3" />
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-sm text-forest">Per page
        <select name="limit" defaultValue={filters.limit ?? '20'} className="min-h-11 rounded-soft border border-border bg-white px-3">
          <option value="10">10</option><option value="20">20</option><option value="50">50</option>
          {filters.limit && /^[1-9][0-9]*$/.test(String(filters.limit)) && Number(filters.limit) <= 50 && !['10', '20', '50'].includes(String(filters.limit)) && <option value={filters.limit}>{filters.limit}</option>}
        </select>
      </label>
    </div>
    <button type="submit" className="min-h-11 rounded-soft bg-forest px-6 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">Search</button>
    <p className="w-full text-xs leading-6 text-muted">Use double quotes for an exact phrase. Other searches require all terms. Chapter filters include only material anchored to that chapter.</p>
  </form>;
}
