import { useState } from 'react';
import Button from '../ui/Button.jsx';
import { Field, inputClass, panel } from '../community/CommunityUI.jsx';
import { articleCategories } from '../../services/articles.service.js';
import { parseArticleReferences, formatArticleReferences } from '../../features/articles/articleInput.js';
import ArticleContent from './ArticleContent.jsx';
export default function ArticleEditor({ article, onSave, onDirtyChange = () => {} }) {
  const [values, setValues] = useState({ title: article?.title || '', subtitle: article?.subtitle || '', body: article?.body || '', excerpt: article?.excerpt || '',
    coverImage: article?.coverImage || '', tags: article?.tags.join(', ') || '', category: article?.category || '', references: formatArticleReferences(article?.canonicalReferences) });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(null);
  function input() {
    const tags = values.tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean), canonicalReferences = parseArticleReferences(values.references);
    if (!values.title.trim() || !values.body.trim()) throw new Error('A title and article body are required.');
    if (tags.length > 8 || new Set(tags).size !== tags.length || tags.some(tag => tag.length > 32 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag))) throw new Error('Use at most eight distinct tag slugs, such as critical-thinking.');
    const { references: _references, ...rest } = values; void _references;
    return { ...rest, title: values.title.trim(), tags, canonicalReferences };
  }
  async function save(event) {
    event.preventDefault(); if (busy) return; setError('');
    try { const data = input(); setBusy(true); await onSave(data); }
    catch (failure) { setError(failure.status === 401 ? 'Please log in again before saving.' : failure.message || 'Draft could not be saved. Your writing remains here.'); }
    finally { setBusy(false); }
  }
  const field = (name, label, maxLength, multiline = false, required = false) => <Field label={label} name={name} maxLength={maxLength} multiline={multiline} required={required}
    {...(multiline ? { rows: name === 'body' ? 18 : 5 } : {})}
    value={values[name]} onChange={event => { setValues(current => ({ ...current, [name]: event.target.value })); setPreview(null); onDirtyChange(true); }} />;
  return <div className="space-y-7"><p className="text-sm leading-7 text-muted">You are writing an article, not editing the manuscript. Plain text preserves paragraphs; HTML and Markdown are displayed as text. Save explicitly before leaving this page.</p>
    <form onSubmit={save} className={panel} aria-busy={busy}><fieldset disabled={busy} className="space-y-5">
      {field('title', 'Title', 180, false, true)}{field('subtitle', 'Subtitle (optional)', 300)}{field('body', 'Article body', 100000, true, true)}
      {field('excerpt', 'Excerpt (optional)', 600, true)}{field('tags', 'Tags (comma-separated, maximum eight)', 300)}
      <Field label="Category"><select name="category" className={inputClass} value={values.category} onChange={event => { setValues(current => ({ ...current, category: event.target.value })); setPreview(null); onDirtyChange(true); }}>
        <option value="">No category</option>{articleCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
      {field('coverImage', 'Approved HTTPS cover image URL (optional)', 2000)}<p className="text-xs leading-6 text-muted">Cover images require a site-approved image origin. Uploads are not available. Unsaved cover URLs are not fetched in preview.</p>
      {field('references', 'Manuscript references (optional, one per line)', 1200, true)}<p className="text-xs leading-6 text-muted">Use freedom, freedom:10, or freedom:10:14. References are checked against the manuscript when saved.</p>
      <div className="flex flex-wrap gap-4"><Button type="submit" disabled={busy} loading={busy}>Save draft</Button>
        <Button variant="secondary" onClick={() => { try { setPreview(input()); setError(''); } catch (failure) { setError(failure.message); } }}>Preview before submission</Button></div>
    </fieldset>{error && <p role="alert" className="text-sm text-red-800">{error}</p>}</form>
    {preview && <section className={panel} aria-label="Draft preview"><p className="text-xs text-muted">Unsaved preview · not submitted</p><ArticleContent article={{ ...preview, author: article?.author, status: 'draft' }} preview /></section>}
  </div>;
}
