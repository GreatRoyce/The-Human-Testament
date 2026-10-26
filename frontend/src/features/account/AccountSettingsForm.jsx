import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import VerificationNotice from '../auth/VerificationNotice.jsx';
import { displayNameError } from './profileValidation.js';
import NotificationLink from '../../components/notifications/NotificationLink.jsx';

export default function AccountSettingsForm({ profile: initialProfile, onSave, onLogout }) {
  const id = useId();
  const [profile, setProfile] = useState(initialProfile);
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ended, setEnded] = useState('');
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setSuccess('');
    const invalid = displayNameError(displayName);
    if (invalid) { setError(invalid); return; }
    setBusy('save'); setError('');
    try {
      const updated = await onSave({ displayName: displayName.trim() });
      setProfile(updated); setDisplayName(updated.displayName); setSuccess('Profile updated.');
    } catch (failure) {
      if (failure.status === 401) setEnded('Your session has ended. Please log in again.');
      else setError(failure.message || 'Your profile could not be updated. Please try again.');
    } finally { setBusy(''); }
  }
  async function logout() {
    if (busy) return;
    setBusy('logout'); setError(''); setSuccess('');
    try { await onLogout(); setEnded('You are logged out.'); }
    catch { setEnded('Signed out on this device. The server could not confirm session revocation.'); }
    finally { setBusy(''); }
  }
  if (ended) return <div className="space-y-4 text-sm leading-7 text-muted">
    <p role="status">{ended}</p>
    <Link to="/login" className="text-forest underline underline-offset-4">Log in</Link>
  </div>;
  return <div className="max-w-reading space-y-7">
    <VerificationNotice user={profile} />
    <dl className="space-y-3 text-sm leading-7">
      <div><dt className="font-medium text-forest">Email address</dt><dd className="break-words text-muted">{profile.email}</dd></div>
      <div><dt className="font-medium text-forest">Email verification</dt><dd className="text-muted">{profile.emailVerified ? 'Verified' : 'Not verified'}</dd></div>
      <div><dt className="font-medium text-forest">Account created</dt><dd className="text-muted"><time dateTime={profile.createdAt}>{profile.createdAt.slice(0, 10)}</time></dd></div>
    </dl>
    <p className="text-sm leading-7 text-muted">Email address changes are not available yet.</p>
    <form onSubmit={save} aria-busy={Boolean(busy)} className="max-w-md space-y-5 rounded-soft border border-border bg-ivory p-5 sm:p-7">
      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-medium text-forest">Display name</label>
        <input id={id} name="displayName" type="text" autoComplete="nickname" required maxLength={80}
          value={displayName} disabled={Boolean(busy)} onChange={event => { setDisplayName(event.target.value); setError(''); setSuccess(''); }}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className="min-h-12 w-full rounded-sm border border-border bg-white px-3 py-2 text-charcoal focus:outline-none focus:ring-2 focus:ring-forest" />
        <p id={`${id}-hint`} className="mt-2 text-xs leading-6 text-muted">Use 1 to 80 characters.</p>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-sm leading-6 text-red-800">{error}</p>}
      {success && <p role="status" className="text-sm leading-6 text-forest">{success}</p>}
      <Button type="submit" loading={busy === 'save'} disabled={Boolean(busy)} size="lg" className="w-full text-sm" rightIcon={null}>Save display name</Button>
    </form>
    <div className="flex flex-wrap items-center gap-5 text-sm text-forest">
      <Link to="/reading/saved-verses" className="underline underline-offset-4">Saved verses</Link>
      <Link to="/reading/notes" className="underline underline-offset-4">Private notes</Link>
      <Link to="/testament" className="underline underline-offset-4">Continue reading</Link>
      <Link to="/reading/history" className="underline underline-offset-4">Reading history</Link>
      <Link to="/community" className="underline underline-offset-4">Community</Link>
      <Link to="/articles/mine" className="underline underline-offset-4">My articles</Link>
      <NotificationLink />
      <Link to="/account/change-password" className="underline underline-offset-4">Change password</Link>
      <Button type="button" variant="secondary" size="lg" className="text-sm" onClick={logout} loading={busy === 'logout'} disabled={Boolean(busy)}>Log out</Button>
    </div>
  </div>;
}
