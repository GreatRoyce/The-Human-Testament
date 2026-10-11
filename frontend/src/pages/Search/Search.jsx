import { useSearchParams } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import SearchForm from '../../features/search/components/SearchForm.jsx';
import SearchResults from '../../features/search/components/SearchResults.jsx';
import { useSearch } from '../../features/search/hooks/useSearch.js';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const results = useSearch(query);
  return <ContentPage title="Search">
    <SearchForm query={query} onSearch={(q) => setParams(q ? { q } : {})} />
    {!query ? <p className="text-sm text-muted">Enter a word or verse reference to search the available text.</p> : <ResourceState resource={results} empty={results.data?.length === 0} emptyMessage="No verses match your search.">
      <SearchResults results={results.data ?? []} />
    </ResourceState>}
  </ContentPage>;
}
