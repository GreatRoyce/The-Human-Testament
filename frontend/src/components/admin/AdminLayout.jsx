import { useCallback } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import ContentPage from '../layout/ContentPage.jsx';
import ResourceState from '../shared/ResourceState.jsx';
import { administrationService } from '../../services/administration.service.js';
import { authService } from '../../services/auth.service.js';
import { useResource } from '../../hooks/useResource.js';
export default function AdminLayout() {
  const load = useCallback(options => administrationService.capabilities(options), []), location = useLocation();
  const resource = useResource(load, `administration-access:${location.pathname}:${authService.getSessionVersion()}`);
  const denied = [401, 403].includes(resource.error?.status);
  return <ContentPage title="Administration">
    <p className="mb-6 max-w-reading text-sm leading-7 text-muted">Account management and reader-content moderation. Canonical manuscript records are managed through the separate editorial approval process.</p>
    {denied ? <p role="alert">{resource.error.status === 401 ? <Link className="underline text-forest" to="/login" state={{ returnTo: location.pathname }}>Log in to access administration.</Link> : 'Your account needs an explicitly provisioned administration permission.'}</p> : <ResourceState resource={resource}>
      {resource.data && <><nav aria-label="Administration navigation" className="mb-7 flex flex-wrap gap-4 border-y border-border py-4 text-sm text-forest">
        {[['Overview', '/admin'], ['Users', '/admin/users'], ['Article review', '/admin/articles'], ['Community moderation', '/admin/community'], ['Reports', '/admin/reports'], ['Audit history', '/admin/audit']].map(([label, to]) => <NavLink className={({ isActive }) => isActive ? 'font-semibold underline underline-offset-4' : 'underline underline-offset-4'} key={to} end to={to}>{label}</NavLink>)}
        {resource.data.analyticsConfigured ? <Link className="underline" to="/admin/analytics">Analytics</Link> : <span className="text-muted">Analytics unavailable</span>}
        <Link className="underline" to="/account/settings">Account settings</Link>
      </nav><Outlet context={resource.data} /></>}
    </ResourceState>}
  </ContentPage>;
}
