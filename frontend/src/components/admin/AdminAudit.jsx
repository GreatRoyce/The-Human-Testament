import { useCallback, useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { administrationService } from '../../services/administration.service.js';
import { Resource, Pagination, ActionForm, Field, inputClass, panel } from '../community/CommunityUI.jsx';
export function AuditEntries({ items }) {
  return <ol className="space-y-4">{items.map(item => <li key={item.id} className={panel}><p className="font-semibold text-forest">{item.action} · {item.targetType}</p>
    <p className="break-all text-xs text-muted">Target {item.targetId} · Actor {item.moderatorId} · <time dateTime={item.createdAt}>{item.createdAt}</time></p>
    <p className="text-sm">{item.previousStatus} → {item.resultingStatus}</p><p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p>
    <p className="text-xs text-muted">{item.source}{item.operatorLabel && ' · ' + item.operatorLabel}</p></li>)}</ol>;
}
export default function AdminAudit({ targetType, targetId, title = 'Audit history' }) {
  const [page, setPage] = useState(1), [filters, setFilters] = useState({});
  const load = useCallback(options => administrationService.audit({ ...filters, ...(targetType ? { targetType } : {}), ...(targetId ? { targetId } : {}), page }, options), [filters, targetType, targetId, page]);
  const resource = useResource(load, `administration-audit:${JSON.stringify(filters)}:${targetType}:${targetId}:${page}:${authService.getSessionVersion()}`);
  return <section className="space-y-6"><h2 className="font-serif text-2xl text-forest">{title}</h2><p className="text-sm leading-7 text-muted">Append-only decisions. Content history also requires moderator access and existing private-circle permissions. Records cannot be edited or removed here.</p>
    <ActionForm label="Filter history" onSave={values => { setPage(1); setFilters(values); }}>
      {!targetType && <Field label="Target type"><select name="targetType" className={inputClass}><option value="">All permitted targets</option>{['user', 'admin_permission', 'article', 'discussion', 'comment', 'report'].map(type => <option key={type}>{type}</option>)}</select></Field>}
      <Field label="Action"><select name="action" className={inputClass}><option value="">All actions</option>{['activate', 'deactivate', 'grant_admin', 'revoke_admin', 'approve', 'reject', 'unpublish', 'archive', 'hide', 'restore', 'lock', 'unlock', 'delete', 'review', 'resolve'].map(action => <option key={action}>{action}</option>)}</select></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="From date (UTC; set both dates)" name="start" type="date" /><Field label="Through date (UTC)" name="end" type="date" /></div>
    </ActionForm>
    <Resource resource={resource} empty="No recorded actions match these filters.">{data => <><AuditEntries items={data.items} /><Pagination label="Audit pagination" pagination={data.pagination} onPage={setPage} /></>}</Resource>
  </section>;
}
