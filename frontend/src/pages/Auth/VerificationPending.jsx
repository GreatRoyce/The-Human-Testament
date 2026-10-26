import { Link } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import AccountForm from '../../features/auth/AccountForm.jsx';
import { authService } from '../../services/auth.service.js';

export default function VerificationPending() {
  return <ContentPage title="Verify your email">
    <p className="mb-6 max-w-reading text-sm leading-7 text-muted">If you registered recently, check your inbox for a verification link. Use the newest link. You can request another below and continue reading while you wait.</p>
    <AccountForm fields={[{ name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' }]}
      submitLabel="Resend verification link" onSubmit={values => authService.resendVerification(values)} repeatable />
    <div className="mt-6 flex flex-wrap gap-5 text-sm text-forest">
      <Link to="/login" className="underline underline-offset-4">Log in</Link>
      <Link to="/testament" className="underline underline-offset-4">Continue reading</Link>
    </div>
  </ContentPage>;
}
