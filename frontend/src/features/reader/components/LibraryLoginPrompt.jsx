import { Link, useLocation } from 'react-router-dom';
export default function LibraryLoginPrompt({ action = 'save verses and keep private notes' }) {
  const location = useLocation();
  return <p className="text-sm leading-7 text-muted">Please <Link to="/login" state={{ returnTo: location.pathname + location.search }}
    className="text-forest underline underline-offset-4">log in</Link> to {action}.</p>;
}
