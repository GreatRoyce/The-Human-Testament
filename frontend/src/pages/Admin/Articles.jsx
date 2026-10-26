import { useCallback } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { articlesService, articleStatuses } from '../../services/articles.service.js';
import ArticleReview from '../../components/articles/ArticleReview.jsx';
import AdminAudit from '../../components/admin/AdminAudit.jsx';
import { Resource, Pagination, ActionForm, Field, inputClass, panel } from '../../components/community/CommunityUI.jsx';
function Queue() {
  const { id } = useParams(), [params, setParams] = useSearchParams(), query = params.toString();
  const load = useCallback(options => id ? articlesService.reviewArticle(id, options) : articlesService.queue(Object.fromEntries(new URLSearchParams(query)), options), [id, query]);
  const resource = useResource(load, `admin-article-review:${id}:${query}:${authService.getSessionVersion()}`);
  return <div className="space-y-6">{!id && <ActionForm key={query} label="Show articles" onSave={values => setParams(values)}><Field label="Publication status"><select className={inputClass} name="status" defaultValue={params.get('status') || 'pending_review'}>{articleStatuses.map(status => <option key={status}>{status}</option>)}</select></Field></ActionForm>}
    <Resource resource={resource} empty="No articles in this review queue.">{data => id ? <><ArticleReview key={data.revision} article={data} refresh={resource.retry} /><AdminAudit key={'audit:' + data.revision} targetType="article" targetId={id} /></> :
      <><ul className="space-y-4">{data.items.map(article => <li className={panel} key={article.id}><Link className="font-serif text-xl text-forest underline" to={'/admin/articles/' + article.id}>{article.title}</Link><p className="text-sm">{article.status} · Version {article.revision} · {article.author.displayName}</p></li>)}</ul>
        <Pagination label="Article review pagination" pagination={data.pagination} onPage={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></>}</Resource>
  </div>;
}
export default function Articles() {
  const capabilities = useOutletContext();
  return <section className="space-y-6"><h2 className="font-serif text-3xl text-forest">Article review</h2>{capabilities.globalModerator ? <Queue /> : <p role="status">Article review requires a separately provisioned global moderator grant. Administration permission does not bypass publication policy.</p>}</section>;
}
