import { Link } from 'react-router-dom';
import { referenceUrl, safeCoverUrl } from '../../features/articles/articleInput.js';
export default function ArticleContent({ article, preview = false }) {
  const cover = !preview && safeCoverUrl(article.coverImage);
  return <article className="space-y-6" aria-label={preview ? 'Article preview' : 'Reader article'}>
    <p className="text-xs uppercase tracking-widest text-bronze-ink">Reader article · {article.status || 'unsaved draft'}</p>
    <h2 className="break-words font-serif text-3xl leading-tight text-forest sm:text-4xl">{article.title}</h2>
    {article.subtitle && <p className="break-words font-serif text-xl leading-8 text-muted">{article.subtitle}</p>}
    <p className="text-sm leading-7 text-muted">By {article.author?.displayName || 'You'}{article.publishedAt && <> · Published <time dateTime={article.publishedAt}>{article.publishedAt.slice(0, 10)}</time></>}
      {article.updatedAt && <> · Updated <time dateTime={article.updatedAt}>{article.updatedAt.slice(0, 10)}</time></>}</p>
    <p className="border-l-2 border-bronze-ink pl-4 text-sm leading-7 text-muted">This is a reader’s interpretation, separate from the canonical manuscript and official author clarifications.</p>
    {cover && <img src={cover} alt="Article cover" loading="lazy" referrerPolicy="no-referrer" className="max-h-96 w-full rounded-soft object-cover" />}
    {article.excerpt && <p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted">{article.excerpt}</p>}
    <div className="whitespace-pre-wrap break-words leading-8 text-charcoal">{article.body}</div>
    {article.tags?.length > 0 && <ul aria-label="Article tags" className="flex flex-wrap gap-3 text-xs text-forest">{article.tags.map(tag => <li key={tag}><Link className="underline" to={'/articles?tag=' + encodeURIComponent(tag)}>#{tag}</Link></li>)}</ul>}
    {article.canonicalReferences?.length > 0 && <aside className="space-y-3 border-t border-border pt-5"><h3 className="font-serif text-xl text-forest">Manuscript references</h3>
      <ul className="space-y-2 text-sm text-forest">{article.canonicalReferences.map((value, index) => <li key={index}><Link className="underline" to={referenceUrl(value)}>{value.verseId || value.bookId + (value.chapterNumber ? ':' + value.chapterNumber : '')}</Link></li>)}</ul></aside>}
  </article>;
}
