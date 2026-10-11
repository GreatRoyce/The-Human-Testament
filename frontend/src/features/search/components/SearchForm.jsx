export default function SearchForm({ query, onSearch }) {
  return <form onSubmit={(event) => {
    event.preventDefault();
    onSearch(new FormData(event.currentTarget).get('q').toString().trim());
  }} className="my-6 flex flex-wrap items-end gap-3">
    <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-forest">
      Search the Testament
      <input key={query} defaultValue={query} name="q" type="search" className="min-h-11 w-full rounded-soft border border-border bg-white px-4 text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest" />
    </label>
    <button type="submit" className="min-h-11 rounded-soft bg-forest px-6 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">Search</button>
  </form>;
}
