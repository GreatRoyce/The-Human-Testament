import LoadingState from '../ui/LoadingState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import EmptyState from '../ui/EmptyState.jsx';

export default function ResourceState({ resource, empty = false, emptyMessage, children }) {
  if (resource.loading) return <LoadingState />;
  if (resource.error) return <ErrorState error={resource.error} onRetry={resource.retry} />;
  if (resource.data == null || empty) return <EmptyState message={emptyMessage} />;
  return children;
}
