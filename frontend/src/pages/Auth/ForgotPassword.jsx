import { Link } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import AccountForm from '../../features/auth/AccountForm.jsx';
import { authService } from '../../services/auth.service.js';

export default function ForgotPassword() {
  return <ContentPage title="Forgot your password?">
    <p className="mb-6 max-w-reading text-sm leading-7 text-muted">Enter your email to request a reset link. The response is the same whether or not an account matches.</p>
    <AccountForm fields={[{ name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' }]}
      submitLabel="Request reset link" onSubmit={values => authService.forgotPassword(values)} repeatable />
    <p className="mt-6"><Link to="/login" className="text-sm text-forest underline underline-offset-4">Back to login</Link></p>
  </ContentPage>;
}
