import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import AccountForm from '../../features/auth/AccountForm.jsx';
import { authService } from '../../services/auth.service.js';
import { readResetToken, scrubResetLink } from '../../features/auth/resetLink.js';

export default function ResetPassword() {
  const location = useLocation();
  return <ResetPasswordForm key={location.key} />;
}

function ResetPasswordForm() {
  const [token] = useState(() => typeof window === 'undefined' ? '' : readResetToken(window.location));
  useEffect(() => {
    // Fragments never reach HTTP access logs. Remove the credential from the
    // address bar/history too; retain it only in this component's memory.
    scrubResetLink(window);
  }, []);
  const usable = token.length === 43 && /^[A-Za-z0-9_-]+$/.test(token);
  return <ContentPage title="Reset your password">
    <meta name="referrer" content="no-referrer" />
    {usable ? <AccountForm fields={[
      { name: 'newPassword', label: 'New password', autoComplete: 'new-password' },
      { name: 'passwordConfirmation', label: 'Confirm new password', autoComplete: 'new-password' },
    ]} submitLabel="Reset password" onSubmit={values => authService.resetPassword({ ...values, token })} /> :
      <p role="alert" className="text-sm leading-7 text-muted">Open the reset link from your email, or request a new link.</p>}
    <div className="mt-6 flex flex-wrap gap-5 text-sm text-forest">
      <Link to="/forgot-password" className="underline underline-offset-4">Request a new reset link</Link>
      <Link to="/login" className="underline underline-offset-4">Log in</Link>
    </div>
  </ContentPage>;
}
