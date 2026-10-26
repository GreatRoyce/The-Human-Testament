import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import ContentPage from '../layout/ContentPage.jsx';
import Button from '../ui/Button.jsx';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { communityService } from '../../services/community.service.js';
import LibraryLoginPrompt from '../../features/reader/components/LibraryLoginPrompt.jsx';
import ResourceState from '../shared/ResourceState.jsx';
import NotificationLink from '../notifications/NotificationLink.jsx';

export const panel = 'space-y-4 rounded-soft border border-border bg-white/50 p-5 sm:p-7';
export const inputClass = 'block min-h-11 w-full rounded-sm border border-border bg-white px-3 py-2 text-charcoal focus:outline-none focus:ring-2 focus:ring-forest';
export function Field({ label, name, multiline = false, children, ...props }) {
  return <label className="block space-y-2 text-sm text-forest"><span>{label}</span>{children || (multiline ?
    <textarea name={name} className={inputClass} rows={5} {...props} /> : <input name={name} className={inputClass} {...props} />)}</label>;
}
export function ActionForm({ onSave, children, label = 'Save', reset = false, confirmation }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [pending, setPending] = useState(null);
  async function save(values, form) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await onSave(values); if (reset) form.reset(); setPending(null); setMessage(result?.message || 'Saved.'); }
    catch (failure) { setError(failure.status === 401 ? 'Your session has ended. Please log in again.' : failure.message || 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (busy || pending) return;
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    if (confirmation) { setError(''); setMessage(''); setPending({ values, form }); return; }
    await save(values, form);
  }
  return <form onSubmit={submit} className={panel} aria-busy={busy}><fieldset disabled={busy || Boolean(pending)} className="space-y-4">{children}
    {!pending && <Button type="submit" loading={busy} disabled={busy} rightIcon={null}>{confirmation ? 'Review: ' + label : label}</Button>}</fieldset>
    {pending && <div role="group" aria-label="Confirm consequential action" className="space-y-4 border-l-2 border-bronze-ink pl-4"><p className="break-words">{confirmation}</p>
      {(pending.values.action || pending.values.status) && <p>Selected action: {pending.values.action || pending.values.status}</p>}
      {pending.values.reason && <p className="whitespace-pre-wrap break-words text-sm">Reason: {pending.values.reason}</p>}
      <div className="flex flex-wrap gap-4"><Button type="button" loading={busy} disabled={busy} onClick={() => { if (!busy) save(pending.values, pending.form); }}>Confirm {label}</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => setPending(null)}>Cancel</Button></div></div>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}{message && <p role="status" className="text-sm text-forest">{message}</p>}
  </form>;
}
export function Action({ run, children }) {
  return <ActionForm label={children} onSave={run} />;
}
export function Resource({ resource, children, empty = 'There is nothing here yet.' }) {
  return <ResourceState resource={resource} empty={resource.data?.items?.length === 0} emptyMessage={empty}>
    {!resource.loading && !resource.error && resource.data ? children(resource.data) : null}
  </ResourceState>;
}
export function Pagination({ pagination, onPage, label = 'Community pagination' }) {
  return <nav aria-label={label} className="my-5 flex flex-wrap items-center gap-5 text-sm text-forest">
    <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</Button>
    <span>Page {pagination.page} of {Math.max(1, pagination.pages)} · {pagination.total} items</span>
    <Button variant="secondary" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Next</Button>
  </nav>;
}
export function CommunityFrame({ title, identity, children }) {
  const load = useCallback(options => communityService.capabilities(options), []);
  const capabilities = useResource(load, `community-capabilities:${authService.getSessionVersion()}`);
  return <ContentPage title={title}>
    <nav aria-label="Community navigation" className="mb-5 flex flex-wrap gap-5 text-sm text-forest">
      <Link className="underline" to="/community/discussions">Discussions</Link><Link className="underline" to="/community/reading-circles">Reading circles</Link>
      <Link className="underline" to="/articles">Articles and essays</Link>
      <NotificationLink />
      {capabilities.data?.globalModerator && <Link className="underline" to="/community/moderation">Moderation</Link>}
      {capabilities.data?.globalModerator && <Link className="underline" to="/articles/moderation">Article review</Link>}
    </nav>
    <aside className="mb-7 border-l-2 border-bronze-ink pl-4 text-sm leading-7 text-muted">
      <p>Community contributions are readers’ interpretations, separate from the canonical manuscript and official author clarifications. Private notes stay private.</p>
      {identity.data ? <><p>Signed in as {identity.data.displayName}. Your account ID for circle invitations: <code className="break-all">{identity.data.id}</code></p>
        {!identity.data.emailVerified && <p><Link className="underline text-forest" to="/verification-pending">Verify your email</Link> before posting, joining, or reporting.</p>}</> :
        !identity.loading && <LibraryLoginPrompt action="participate in the community" />}
      {identity.error && <p role="alert">{identity.error.message}</p>}
    </aside><div className="max-w-reading space-y-7">{children}</div>
  </ContentPage>;
}
export function ReportForm({ targetType, targetId, enabled }) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return <div><Button variant="secondary" onClick={() => setOpen(value => !value)}>{open ? 'Close report' : 'Report content'}</Button>
    {open && <ActionForm label="Submit report" onSave={values => communityService.report({ ...values, targetType, targetId })}>
      <Field label="Reason"><select name="reason" className={inputClass}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="hate">Hate</option><option value="other">Other</option></select></Field>
      <Field label="Details (optional, visible to authorized moderators)" name="details" multiline maxLength={1000} />
    </ActionForm>}</div>;
}
export function ModerationForm({ targetType, targetId, onDone = () => {} }) {
  return <details className={panel}><summary className="cursor-pointer text-sm text-forest">Moderation actions</summary>
    <ActionForm label="Record moderation action" confirmation={`Confirm moderation of ${targetType} ${targetId}. This decision will be recorded in the audit history.`} onSave={async values => { const result = await communityService.moderate({ ...values, targetType, targetId }); onDone(); return result; }}>
      <p className="text-xs text-muted">Actions require a reason and remain in the audit trail. Another moderator must review your own content.</p>
      <Field label="Action"><select name="action" className={inputClass}><option value="hide">Hide</option><option value="restore">Restore</option>
        {targetType === 'discussion' && <><option value="lock">Lock</option><option value="unlock">Unlock</option></>}<option value="delete">Remove</option></select></Field>
      <Field label="Moderation reason" name="reason" required maxLength={1000} multiline />
    </ActionForm></details>;
}
