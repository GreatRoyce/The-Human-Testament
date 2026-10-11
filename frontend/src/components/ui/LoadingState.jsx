export default function LoadingState({ message = 'Loading content…' }) {
  return <p role="status" className="p-5 text-sm leading-7 text-muted">{message}</p>;
}
