import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import { articlesService, articleCategories } from '../../services/articles.service.js';
import { authService } from '../../services/auth.service.js';
import ArticleFrame from '../../components/articles/ArticleFrame.jsx';
import ArticleCard from '../../components/articles/ArticleCard.jsx';
import { Resource, Pagination, ActionForm, Field, inputClass } from '../../components/community/CommunityUI.jsx';
export default function Articles() {
  const identity = useCommunityIdentity(), [params, setParams] = useSearchParams(), query = params.toString();
  const load = useCallback(options => articlesService.list(Object.fromEntries(new URLSearchParams(query)), options), [query]);
  const resource = useResource(load, `articles:${query}:${authService.getSessionVersion()}`);
  return <ArticleFrame title="Articles and essays" identity={identity}><p className="text-sm leading-7 text-muted">Approved reader contributions. Approval permits publication; it does not make an article part of the canonical manuscript.</p>
    <ActionForm key={query} label="Filter articles" onSave={values => { setParams(Object.fromEntries(Object.entries(values).filter(([, value]) => value))); return { message: 'Filters applied.' }; }}>
      <Field label="Category"><select name="category" className={inputClass} defaultValue={params.get('category') || ''}><option value="">All categories</option>{articleCategories.map(category => <option key={category}>{category}</option>)}</select></Field>
      <Field name="tag" label="Tag (optional)" maxLength={32} defaultValue={params.get('tag') || ''} placeholder="reflection" /></ActionForm>
    <Resource resource={resource} empty="No published articles match these filters.">{data => <><div className="space-y-5">{data.items.map(item => <ArticleCard key={item.id} article={item} />)}</div>
      <Pagination pagination={data.pagination} onPage={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></>}</Resource>
  </ArticleFrame>;
}
