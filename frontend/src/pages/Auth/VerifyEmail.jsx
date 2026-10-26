import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import AccountForm from '../../features/auth/AccountForm.jsx';
import { readAccountToken, scrubAccountLink } from '../../features/auth/resetLink.js';
import { authService } from '../../services/auth.service.js';

export default function VerifyEmail() {
  const location = useLocation();
  return <VerificationForm key={location.key} />;
}
function VerificationForm() {
  const [token] = useState(() => typeof window === 'undefined' ? '' : readAccountToken(window.location));
  useEffect(() => { scrubAccountLink(window); }, []);
  const usable = token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token);
  return <ContentPage title="Confirm your email address">
    <meta name="referrer" content="no-referrer" />
    {usable ? <>
      <p className="mb-6 max-w-reading text-sm leading-7 text-muted">Confirm to verify the email address associated with this link. Opening this page alone does not consume the link.</p>
      <AccountForm fields={[]} submitLabel="Verify email" onSubmit={() => authService.verifyEmail({ token })} />
    </> : <p role="alert" className="text-sm leading-7 text-muted">This verification link is missing or invalid. If your link expired or was already used, request a new one.</p>}
    <div className="mt-6 flex flex-wrap gap-5 text-sm text-forest">
      <Link to="/verification-pending" className="underline underline-offset-4">Request a new verification link</Link>
      <Link to="/login" className="underline underline-offset-4">Log in</Link>
      <Link to="/testament" className="underline underline-offset-4">Continue reading</Link>
    </div>
  </ContentPage>;
}
