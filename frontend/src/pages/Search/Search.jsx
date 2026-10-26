import { useSearchParams } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import SearchForm from '../../features/search/components/SearchForm.jsx';
import SearchResults from '../../features/search/components/SearchResults.jsx';
import { useSearch } from '../../features/search/hooks/useSearch.js';
import { useBooks } from '../../features/testament/hooks/useBooks.js';
import Button from '../../components/ui/Button.jsx';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const filters = { book: params.get('book') ?? undefined, chapter: params.get('chapter') ?? undefined,
    type: params.get('type') ?? 'all', page: params.get('page') ?? '1', limit: params.get('limit') ?? '20' };
  const books = useBooks();
  const results = useSearch(query, filters);
  function page(next) { setParams({ q: query, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)), page: String(next) }); }
  return <ContentPage title="Search">
    <SearchForm key={params.toString()} query={query} filters={filters} books={books.data ?? []} booksLoading={books.loading} onSearch={values => setParams({ ...values, page: '1' })} />
    {books.error && <p role="alert" className="mb-4 text-sm text-red-800">Book filters could not be loaded. You can still search all books.</p>}
    {!query ? <p className="text-sm text-muted">Enter a word, phrase, term or verse reference to search the manuscript.</p> : <ResourceState resource={results}>
      {results.data && <div className="space-y-5">
        <p role="status" className="text-sm text-muted">{results.data.pagination.total} manuscript results · Page {results.data.pagination.page} of {Math.max(1, results.data.pagination.pages)}</p>
        {results.data.items.length ? <SearchResults results={results.data.items} /> : <p className="text-sm text-muted">No manuscript results on this page. Try another query, filter or page.</p>}
        <nav aria-label="Search result pages" className="flex flex-wrap items-center gap-3">
          {results.data.pagination.page > 1 && <Button variant="secondary" size="lg" className="text-sm" onClick={() => page(1)}>First page</Button>}
          <Button variant="secondary" size="lg" className="text-sm" disabled={results.data.pagination.page <= 1} onClick={() => page(results.data.pagination.page - 1)}>Previous</Button>
          <Button variant="secondary" size="lg" className="text-sm" disabled={results.data.pagination.page >= results.data.pagination.pages} onClick={() => page(results.data.pagination.page + 1)}>Next</Button>
        </nav>
      </div>}
    </ResourceState>}
  </ContentPage>;
}
