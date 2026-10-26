import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import AccountForm from '../../features/auth/AccountForm.jsx';
import VerificationNotice from '../../features/auth/VerificationNotice.jsx';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';

export default function ChangePassword() {
  const load = useCallback(options => authService.getCurrentUser(options), []);
  const profile = useResource(load, 'change-password-profile');
  return <ContentPage title="Change your password">
    {profile.error?.status === 401 ? <p className="text-sm text-muted">Please <Link to="/login" className="text-forest underline">log in</Link> to change your password.</p> :
      <ResourceState resource={profile}>
        <VerificationNotice user={profile.data} />
        <p className="mb-6 max-w-reading text-sm leading-7 text-muted">Changing your password signs out all devices. You will need to log in again.</p>
        <AccountForm fields={[
          { name: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
          { name: 'newPassword', label: 'New password', autoComplete: 'new-password' },
          { name: 'passwordConfirmation', label: 'Confirm new password', autoComplete: 'new-password' },
        ]} submitLabel="Change password" onSubmit={values => authService.changePassword(values)} />
      </ResourceState>}
    <p className="mt-6"><Link to="/login" className="text-sm text-forest underline underline-offset-4">Log in</Link></p>
    <p className="mt-4"><Link to="/account/settings" className="text-sm text-forest underline underline-offset-4">Account settings</Link></p>
  </ContentPage>;
}
