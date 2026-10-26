import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import { articlesService, articleStatuses } from '../../services/articles.service.js';
import { authService } from '../../services/auth.service.js';
import ArticleFrame from '../../components/articles/ArticleFrame.jsx';
import ArticleCard from '../../components/articles/ArticleCard.jsx';
import ArticleReview from '../../components/articles/ArticleReview.jsx';
import { Resource, Pagination, ActionForm, Field, inputClass, panel } from '../../components/community/CommunityUI.jsx';
export default function ArticleModeration() {
  const { id } = useParams(), [params, setParams] = useSearchParams(), identity = useCommunityIdentity(), query = params.toString();
  const load = useCallback(options => id ? articlesService.reviewArticle(id, options) : articlesService.queue(Object.fromEntries(new URLSearchParams(query)), options), [id, query]);
  const resource = useResource(load, `article-review:${id}:${query}:${authService.getSessionVersion()}`);
  return <ArticleFrame title="Article publication review" identity={identity}>
    {!id && <ActionForm key={query} label="Show review queue" onSave={values => setParams(values)}><Field label="Publication status"><select name="status" className={inputClass} defaultValue={params.get('status') || 'pending_review'}>{articleStatuses.map(status => <option key={status}>{status}</option>)}</select></Field></ActionForm>}
    <Resource resource={resource} empty="No articles in this review queue.">{data => id ? <ArticleReview key={data.revision} article={data} refresh={resource.retry} /> :
      <div className={panel}>{data.items.map(item => <ArticleCard key={item.id} article={item} moderator />)}<Pagination pagination={data.pagination} onPage={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></div>}</Resource>
  </ArticleFrame>;
}
