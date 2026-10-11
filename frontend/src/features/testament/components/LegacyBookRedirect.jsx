import { Navigate, useParams } from 'react-router-dom';
import ContentPage from '../../../components/layout/ContentPage.jsx';
import ResourceState from '../../../components/shared/ResourceState.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { useBooks } from '../hooks/useBooks.js';

export default function LegacyBookRedirect() {
  const { bookId } = useParams();
  const books = useBooks();
  const book = books.data?.find((entry) => String(entry.order) === bookId);
  if (book) return <Navigate to={`/testament/${book.slug}`} replace />;
  return <ContentPage title="Book">
    <ResourceState resource={books}><EmptyState message="This book is not available." /></ResourceState>
  </ContentPage>;
}
