import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import BookGrid from '../../features/testament/components/BookGrid.jsx';
import { useBooks } from '../../features/testament/hooks/useBooks.js';
import { Link } from 'react-router-dom';
import ContinueReading from '../../components/reading/ContinueReading.jsx';

export default function Testament() {
  const books = useBooks();
  return <ContentPage title="The Testament">
    <ContinueReading />
    <p className="mb-6"><Link to="/testament/materials" className="text-sm text-forest underline underline-offset-4">Opening pages, closing text, index and glossary</Link></p>
    <ResourceState resource={books} empty={books.data?.length === 0}>
      <BookGrid books={books.data ?? []} headingAs="h2" />
    </ResourceState>
  </ContentPage>;
}
