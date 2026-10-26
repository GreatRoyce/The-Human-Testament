import { Link } from 'react-router-dom';

export default function VerificationNotice({ user }) {
  if (!user || user.emailVerified) return null;
  return <aside role="status" className="mb-6 max-w-reading rounded-soft border border-border bg-ivory p-5 text-sm leading-7 text-muted">
    <p>Your email address is not verified yet. You can continue reading and manage your password.</p>
    <Link to="/verification-pending" className="text-forest underline underline-offset-4">Request a verification email</Link>
  </aside>;
}
