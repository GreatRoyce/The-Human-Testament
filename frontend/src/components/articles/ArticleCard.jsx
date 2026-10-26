import { Link } from 'react-router-dom';
import { panel } from '../community/CommunityUI.jsx';
export default function ArticleCard({ article, management = false, moderator = false }) {
  const url = moderator ? '/articles/moderation/' + article.id : management ? '/articles/mine/' + article.id : '/articles/' + article.slug;
  return <article className={panel}><p className="text-xs uppercase tracking-widest text-bronze-ink">Reader article · {article.status}</p>
    <h2 className="break-words font-serif text-2xl text-forest"><Link className="underline" to={url}>{article.title}</Link></h2>
    {article.subtitle && <p className="break-words text-sm text-muted">{article.subtitle}</p>}
    <p className="text-sm text-muted">By {article.author.displayName}{article.publishedAt && <> · {article.publishedAt.slice(0, 10)}</>}</p>
    {article.excerpt && <p className="whitespace-pre-wrap break-words text-sm leading-7">{article.excerpt}</p>}
    <p className="text-xs text-forest">{article.category}{article.tags.length ? ' · ' + article.tags.map(tag => '#' + tag).join(' ') : ''}</p>
  </article>;
}
