import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import BookGrid from '../../features/testament/components/BookGrid.jsx';
import { useBooks } from '../../features/testament/hooks/useBooks.js';

export default function Testament() {
  const books = useBooks();
  return <ContentPage title="The Testament">
    <ResourceState resource={books} empty={books.data?.length === 0}>
      <BookGrid books={books.data ?? []} headingAs="h2" />
    </ResourceState>
  </ContentPage>;
}
