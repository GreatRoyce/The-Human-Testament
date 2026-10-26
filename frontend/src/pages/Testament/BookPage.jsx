import { useParams } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import ChapterNavigation from '../../features/testament/components/ChapterNavigation.jsx';
import { useBook } from '../../features/testament/hooks/useBook.js';
import { useChapters } from '../../features/testament/hooks/useChapters.js';
import ContinueReading from '../../components/reading/ContinueReading.jsx';

export default function BookPage() {
  const { bookSlug } = useParams();
  const book = useBook(bookSlug);
  const chapters = useChapters(bookSlug);
  return <ContentPage title={book.data ? `Book of ${book.data.title}` : 'Book'}>
    <ResourceState resource={book}>
      <p className="max-w-reading text-sm leading-7 text-muted">{book.data?.description}</p>
      <ContinueReading bookId={bookSlug} />
      <h2 className="mt-8 font-serif text-2xl text-forest">Available chapters</h2>
      <ResourceState resource={chapters} empty={chapters.data?.length === 0} emptyMessage="No chapter text is available for this book yet.">
        <ChapterNavigation bookSlug={bookSlug} chapters={chapters.data ?? []} />
      </ResourceState>
    </ResourceState>
  </ContentPage>;
}
