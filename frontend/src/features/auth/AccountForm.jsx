import { useId, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import { passwordFormError } from './passwordPolicy.js';

export default function AccountForm({ fields, submitLabel, onSubmit, repeatable = false }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const invalid = passwordFormError(values);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError('');
    try {
      const result = await onSubmit(values);
      form.reset(); setSuccess(result?.message ?? 'Completed.');
    } catch (failure) { setError(failure.message || 'The request could not be completed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="max-w-md rounded-soft border border-border bg-ivory p-5 sm:p-7">
    {success ? <div role="status" className="space-y-4 text-sm leading-7 text-forest">
      <p>{success}</p>
      {repeatable && <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setSuccess('')}>Submit another request</button>}
    </div> : <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
      {fields.map(field => <div key={field.name}>
        <label htmlFor={`${id}-${field.name}`} className="mb-2 block text-sm font-medium text-forest">{field.label}</label>
        <input id={`${id}-${field.name}`} name={field.name} type={field.type ?? 'password'} autoComplete={field.autoComplete}
          required disabled={busy} aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-12 w-full rounded-sm border border-border bg-white px-3 py-2 text-charcoal focus:outline-none focus:ring-2 focus:ring-forest" />
      </div>)}
      {fields.some(field => field.name === 'newPassword') && <p className="text-xs leading-6 text-muted">Use a passphrase of at least 12 characters, up to 72 UTF-8 bytes. Spaces are allowed; control characters are not.</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm leading-6 text-red-800">{error}</p>}
      <Button type="submit" loading={busy} disabled={busy} size="lg" className="w-full text-sm" rightIcon={null}>{submitLabel}</Button>
    </form>}
  </div>;
}
