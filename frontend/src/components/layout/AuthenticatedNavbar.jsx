import { useCallback, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import Logo from '../branding/Logo.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { authService } from '../../services/auth.service.js';
import { administrationService } from '../../services/administration.service.js';
import { useResource } from '../../hooks/useResource.js';

const items = [
  ['Dashboard', '/dashboard'],
  ['Read', '/testament'],
  ['Search', '/search'],
  ['Library', '/reading/saved-verses'],
  ['Articles', '/articles'],
  ['Community', '/community'],
  ['Notifications', '/notifications'],
];

const navLink = ({ isActive }) => `inline-flex min-h-11 items-center rounded-sm px-2 text-sm text-forest underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest ${isActive ? 'font-semibold underline' : ''}`;

export default function AuthenticatedNavbar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const loadCapabilities = useCallback(options => administrationService.capabilities(options), []);
  const capabilities = useResource(loadCapabilities, `navigation-admin:${authService.getSessionVersion()}`);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await authService.logout();
      navigate('/welcome', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Sign out could not be confirmed. Your local session has been cleared.');
      navigate('/welcome', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  function closeMenu(event) {
    const details = event.currentTarget.closest('details');
    if (details) details.open = false;
  }

  return <header className="fixed inset-x-0 top-0 z-20 border-b border-border bg-ivory">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-30 focus:rounded-soft focus:bg-forest focus:px-4 focus:py-3 focus:text-white">Skip to main content</a>
    <nav aria-label="Reader navigation" className="mx-auto flex min-h-16 max-w-content items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
      <Link to="/dashboard" aria-label="Reader dashboard" className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">
        <Logo type="horizontal" alt="The Human Testament" width={150} imageClassName="h-auto max-w-full" />
      </Link>
      <ul className="hidden flex-wrap items-center gap-1 xl:flex">
        {items.map(([label, to]) => <li key={to}><NavLink to={to} end={to === '/dashboard'} className={navLink}>{label}</NavLink></li>)}
        {capabilities.data?.administration && <li><NavLink to="/admin" className={navLink}>Administration</NavLink></li>}
      </ul>
      <details className="relative xl:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-sm px-3 text-sm text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest [&::-webkit-details-marker]:hidden">Menu</summary>
        <div className="absolute right-0 top-full mt-2 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto rounded-sm border border-border bg-ivory p-4 shadow-lg">
          <ul className="space-y-1">
            {items.map(([label, to]) => <li key={to}><NavLink to={to} end={to === '/dashboard'} onClick={closeMenu} className={({ isActive }) => `${navLink({ isActive })} w-full`}>{label}</NavLink></li>)}
            {capabilities.data?.administration && <li><NavLink to="/admin" onClick={closeMenu} className={({ isActive }) => `${navLink({ isActive })} w-full`}>Administration</NavLink></li>}
          </ul>
          <div className="mt-3 border-t border-border pt-3">
            <p className="px-2 py-2 text-sm text-muted">{user.displayName}</p>
            <Link to="/account/settings" onClick={closeMenu} className={`${navLink({ isActive: false })} w-full`}>Account settings</Link>
            <Link to="/welcome" onClick={closeMenu} className={`${navLink({ isActive: false })} w-full`}>Public homepage</Link>
            <button type="button" disabled={busy} onClick={event => { closeMenu(event); signOut(); }}
              className="flex min-h-11 w-full items-center rounded-sm px-2 text-left text-sm text-forest underline underline-offset-4 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </details>
      <div className="hidden items-center gap-3 xl:flex">
        <span className="max-w-40 truncate text-sm text-muted" title={user.displayName}>{user.displayName}</span>
        <Link to="/account/settings" className="text-sm text-forest underline underline-offset-4">Settings</Link>
        <Link to="/welcome" className="text-sm text-forest underline underline-offset-4">Public home</Link>
        <button type="button" disabled={busy} onClick={signOut} className="min-h-11 px-2 text-sm text-forest underline underline-offset-4 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest">
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </nav>
  </header>;
}
