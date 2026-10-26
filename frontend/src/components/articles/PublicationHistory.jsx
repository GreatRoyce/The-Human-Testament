import { useCallback, useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { articlesService } from '../../services/articles.service.js';
import { Resource, Pagination, panel } from '../community/CommunityUI.jsx';
export default function PublicationHistory({ id, moderator = false }) {
  const [page, setPage] = useState(1), load = useCallback(options => articlesService.publications(id, moderator, { page, limit: 5 }, options), [id, moderator, page]);
  const resource = useResource(load, `publication-history:${id}:${moderator}:${page}:${authService.getSessionVersion()}`);
  return <details className={panel}><summary className="cursor-pointer text-forest">Approved publication history</summary>
    <Resource resource={resource} empty="No approved versions yet.">{data => <><div className="space-y-5">{data.items.map(item => <details className={panel} key={item.id}>
      <summary className="cursor-pointer text-sm text-forest">Version {item.revision} · {item.publishedAt.slice(0, 10)}</summary>
      <p className="break-words font-serif text-xl">{item.content.title}</p><p className="whitespace-pre-wrap break-words leading-8">{item.content.body}</p>
      <p className="break-words text-xs text-muted">Approved by {item.approvedBy}: {item.reason}</p></details>)}</div>
      <Pagination pagination={data.pagination} onPage={setPage} /></>}</Resource></details>;
}
