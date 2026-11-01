import { Link, useLocation, useNavigate } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import AccountForm from '../../features/auth/AccountForm.jsx';
import { authService } from '../../services/auth.service.js';
import { loginDestination } from '../../utils/authNavigation.js';

export default function Login() {
  const navigate = useNavigate();
  const returnTo = useLocation().state?.returnTo;
  const destination = loginDestination(returnTo);
  return <ContentPage title="Log in">
    <AccountForm fields={[
      { name: 'email', label: 'Email address', type: 'email', autoComplete: 'email' },
      { name: 'password', label: 'Password', autoComplete: 'current-password' },
    ]} submitLabel="Log in" onSubmit={async values => { await authService.login(values); navigate(destination, { replace: true }); }} />
    <p className="mt-6"><Link to="/forgot-password" className="text-sm text-forest underline underline-offset-4">Forgot your password?</Link></p>
    <p className="mt-4"><Link to="/verification-pending" className="text-sm text-forest underline underline-offset-4">Verify your email or request a new link</Link></p>
    <p className="mt-4 text-sm text-muted">New to the Testament? <Link to="/register" className="text-forest underline underline-offset-4">Create an account</Link></p>
  </ContentPage>;
}
