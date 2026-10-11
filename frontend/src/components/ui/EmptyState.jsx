export default function EmptyState({ message = 'No content is available yet.' }) {
  return <p role="status" className="p-5 text-sm leading-7 text-muted">{message}</p>;
}
