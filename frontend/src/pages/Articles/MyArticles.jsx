import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import { articlesService, articleStatuses } from '../../services/articles.service.js';
import { authService } from '../../services/auth.service.js';
import ArticleFrame from '../../components/articles/ArticleFrame.jsx';
import ArticleCard from '../../components/articles/ArticleCard.jsx';
import { Resource, Pagination, ActionForm, Field, inputClass } from '../../components/community/CommunityUI.jsx';
export default function MyArticles() {
  const identity = useCommunityIdentity(), [params, setParams] = useSearchParams(), query = params.toString();
  const load = useCallback(options => articlesService.mine(Object.fromEntries(new URLSearchParams(query)), options), [query]);
  const resource = useResource(load, `my-articles:${query}:${authService.getSessionVersion()}`);
  return <ArticleFrame title="My articles" identity={identity}><ActionForm label="Filter my articles" onSave={values => setParams(values.status ? { status: values.status } : {})}>
    <Field label="Status"><select name="status" className={inputClass} defaultValue={params.get('status') || ''}><option value="">All my articles</option>{articleStatuses.map(status => <option key={status}>{status}</option>)}</select></Field></ActionForm>
    <Resource resource={resource} empty="You have no articles in this view yet.">{data => <><div className="space-y-5">{data.items.map(item => <ArticleCard key={item.id} article={item} management />)}</div>
      <Pagination pagination={data.pagination} onPage={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></>}</Resource>
  </ArticleFrame>;
}
