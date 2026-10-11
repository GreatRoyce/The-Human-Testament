import Button from './Button.jsx';

export default function ErrorState({ error, onRetry }) {
  const unavailable = error.code === 'NOT_FOUND' || error.code === 'INVALID_INPUT';
  return (
    <div role="alert" className="rounded-soft border border-border p-5 text-sm leading-7 text-muted">
      <p className="font-semibold text-forest">{unavailable ? 'Content unavailable' : 'Unable to load content'}</p>
      <p>{error.message}</p>
      {!unavailable && onRetry && <Button variant="secondary" className="mt-3 min-h-11" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
