import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { communityService } from '../../services/community.service.js';
import { Resource, Pagination, ActionForm, Field, ModerationForm, panel, inputClass } from './CommunityUI.jsx';
export default function ModerationQueue({ circleId, initialTargetType = '', articleReviewBase = '/articles/moderation/' }) {
  const [page, setPage] = useState(1), [status, setStatus] = useState('open'), [target, setTarget] = useState(null);
  const [filters, setFilters] = useState(initialTargetType ? { targetType: initialTargetType } : {});
  const load = useCallback(options => communityService.reports({ page, status, ...filters, ...(circleId ? { circleId } : {}) }, options), [page, status, circleId, filters]);
  const resource = useResource(load, `moderation:${circleId}:${page}:${status}:${JSON.stringify(filters)}:${authService.getSessionVersion()}`);
  const auditLoad = useCallback(options => target ? communityService.audit(target, options) : Promise.resolve({ items: [] }), [target]);
  const audit = useResource(auditLoad, `audit:${target?.targetId}:${target?.targetType}:${authService.getSessionVersion()}`);
  return <>
    <ActionForm label="Show queue" onSave={values => { const { status, ...next } = values; setPage(1); setStatus(status); setFilters(Object.fromEntries(Object.entries(next).filter(([, value]) => value !== ''))); }}>
      <Field label="Report status"><select name="status" className={inputClass}><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select></Field>
      <Field label="Content type"><select name="targetType" className={inputClass} defaultValue={initialTargetType}><option value="">All types</option><option value="discussion">Discussion</option><option value="comment">Comment</option><option value="article">Article</option></select></Field>
      <Field label="Report reason"><select name="reason" className={inputClass}><option value="">All reasons</option>{['spam', 'harassment', 'hate', 'other'].map(reason => <option key={reason}>{reason}</option>)}</select></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="From date (UTC; set both dates)" name="start" type="date" /><Field label="Through date (UTC)" name="end" type="date" /></div>
    </ActionForm>
    <Resource resource={resource} empty="No reports in this queue.">{data => <><div className="space-y-7">{data.items.map(report => <article key={report.id} className={panel}>
      <h2 className="font-serif text-xl text-forest">{report.targetType}: {report.reason}</h2><p className="break-all text-xs">Target ID: {report.targetId}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{report.details}</p>
      {report.context && <aside className="space-y-3 border-l-2 border-bronze-ink pl-4"><p className="text-xs text-muted">Reported reader content · {report.context.status}</p>
        {report.context.title && <p className="font-serif text-xl">{report.context.title}</p>}<p className="whitespace-pre-wrap break-words text-sm">{report.context.body}</p>
        <Link className="text-sm text-forest underline" to={report.targetType === 'article' ? articleReviewBase + report.targetId : '/community/discussions/' + report.context.discussionId}>{report.targetType === 'article' ? 'Review article publication' : 'Open discussion (if available)'}</Link></aside>}
      {report.targetType !== 'article' && <ModerationForm targetType={report.targetType} targetId={report.targetId} onDone={() => { resource.retry(); audit.retry(); }} />}
      <ActionForm label="Record report review" confirmation="Confirm this report decision. Resolution closes the report; use the reason to explain dismissal or action taken." onSave={async values => { const result = await communityService.review(report.id, values.status, values.reason); resource.retry(); return result; }}>
        <Field label="Review result"><select name="status" className={inputClass}><option value="reviewed">Reviewed</option><option value="resolved">Resolve / dismiss with reason</option></select></Field>
        <Field name="reason" label="Review reason" required multiline maxLength={1000} /></ActionForm>
    </article>)}</div><Pagination pagination={data.pagination} onPage={setPage} /></>}</Resource>
    <ActionForm label="Inspect target history" onSave={values => setTarget(values)}><Field label="Target type"><select name="targetType" className={inputClass}><option value="discussion">Discussion</option><option value="comment">Comment</option></select></Field>
      <Field label="Target ID" name="targetId" required pattern="[a-f0-9]{24}" maxLength={24} /></ActionForm>
    {target && <><ModerationForm {...target} onDone={audit.retry} /><Resource resource={audit} empty="No recorded actions.">{data => <ul className="space-y-3">{data.items.map(item => <li className={panel} key={item.id}>
      <p>{item.action} · {item.previousStatus} → {item.resultingStatus}</p><p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p><p className="text-xs">Moderator {item.moderatorId} · {item.createdAt}</p>
    </li>)}</ul>}</Resource></>}
  </>;
}
