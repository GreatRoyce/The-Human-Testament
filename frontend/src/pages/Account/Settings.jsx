import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import AccountSettingsForm from '../../features/account/AccountSettingsForm.jsx';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import AnalyticsLinks from '../../components/analytics/AnalyticsLinks.jsx';
import AdminLink from '../../components/admin/AdminLink.jsx';

export default function Settings() {
  const load = useCallback(options => authService.getProfile(options), []);
  const profile = useResource(load, 'account-settings-profile');
  return <ContentPage title="Account settings">
    <nav aria-label="Analytics dashboards" className="mb-5 flex flex-wrap gap-5 text-sm text-forest"><AnalyticsLinks /></nav>
    {profile.data && <nav aria-label="Administration access" className="mb-5 text-sm text-forest"><AdminLink /></nav>}
    {profile.error?.status === 401 ? <p className="text-sm leading-7 text-muted">Please <Link to="/login" className="text-forest underline">log in</Link> to view your account settings.</p> :
      <ResourceState resource={profile}>
        {profile.data && <AccountSettingsForm key={profile.data.id} profile={profile.data}
          onSave={values => authService.updateProfile(values)} onLogout={() => authService.logout()} />}
      </ResourceState>}
  </ContentPage>;
}
