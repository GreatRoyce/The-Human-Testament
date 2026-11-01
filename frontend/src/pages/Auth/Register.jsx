import { Link, useNavigate } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import AccountForm from '../../features/auth/AccountForm.jsx';
import { authService } from '../../services/auth.service.js';

export default function Register() {
  const navigate = useNavigate();
  return <ContentPage title="Create an account">
    <p className="mb-6 max-w-reading text-sm leading-7 text-muted">Create a reader account to keep private notes, saved passages, and reading progress. You can read the Testament without an account.</p>
    <AccountForm fields={[
      { name: 'displayName', label: 'Name', type: 'text', autoComplete: 'name' },
      { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
      { name: 'password', label: 'Password', autoComplete: 'new-password' },
    ]} submitLabel="Create account" onSubmit={async values => {
      await authService.register(values);
      navigate('/verification-pending', { replace: true, state: { email: values.email } });
      return { message: 'Account created.' };
    }} />
    <p className="mt-6 text-sm text-muted">Already have an account? <Link to="/login" className="text-forest underline underline-offset-4">Sign in</Link></p>
  </ContentPage>;
}