import { Link } from 'react-router-dom';
import { AuditEntries } from './AdminAudit.jsx';
const card = 'space-y-3 rounded-soft border border-border bg-white/50 p-5';
function Metric({ label, value }) { return <div className={card}><h3 className="text-sm text-muted">{label}</h3><p className="text-3xl text-forest">{value.toLocaleString()}</p></div>; }
export default function AdminOverview({ data }) {
  return <section className="space-y-7"><h2 className="font-serif text-3xl text-forest">Platform overview</h2>
    <p className="text-sm text-muted">Live at {data.health.timestamp}. Registration recency covers the last {data.users.recentDays} days. Counts may change while reviewing.</p>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Registered users" value={data.users.total} /><Metric label="Recently registered" value={data.users.recent} /><Metric label="Active accounts" value={data.users.active} /><Metric label="Deactivated accounts" value={data.users.deactivated} /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className={card}><h3 className="font-serif text-xl text-forest">Articles awaiting review</h3>{data.articles.available ? <p>{data.articles.data.pending} pending submissions</p> : <p>{data.articles.message}</p>}</div>
      <div className={card}><h3 className="font-serif text-xl text-forest">Outstanding reports</h3>{data.reports.available ? <p>{data.reports.data.outstanding} accessible open or reviewed reports</p> : <p>{data.reports.message}</p>}</div></div>
    <p className="border-l-2 border-bronze-ink pl-4 text-sm leading-7">{data.communityQueue.message}</p>
    <section className="space-y-4"><h3 className="font-serif text-2xl text-forest">Website traffic</h3>{data.analytics.available ? <>
      <p className="text-sm">{data.analytics.data.range.start} through {data.analytics.data.range.end} (UTC). Consent-based observations; today is incomplete.</p>
      {(data.analytics.data.coverage.partial || data.analytics.data.coverage.empty) && <p role="status">Traffic coverage is partial or empty. No historical visits are inferred.</p>}
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Visits / sessions" value={data.analytics.data.metrics.visits.current} /><Metric label="Estimated unique browsers" value={data.analytics.data.metrics.estimatedVisitors.current} /><Metric label="Page views" value={data.analytics.data.metrics.pageViews.current} /></div>
      <p className="text-sm text-muted">Browser estimates are not exact people. One session may contain several page views.</p>
      {data.analytics.data.pages.length ? <ul className="space-y-2 text-sm">{data.analytics.data.pages.map(row => <li key={row.label} className="flex flex-wrap justify-between gap-4"><span className="break-all">{row.label}</span><span>{row.pageViews} views</span></li>)}</ul> : <p>No popular pages recorded.</p>}
      <Link className="text-forest underline" to="/admin/analytics">Open existing analytics dashboard</Link></> : <p role="status">Analytics unavailable: {data.analytics.message}</p>}</section>
    <section className="space-y-4"><h3 className="font-serif text-2xl text-forest">Recent moderation and account actions</h3>{data.recentActions.length ? <AuditEntries items={data.recentActions} /> : <p>No accessible actions have been recorded.</p>}</section>
    <section className={card}><h3 className="font-serif text-xl text-forest">Platform health</h3><p className="text-sm">Authentication and administration storage are ready. Optional article, report and analytics availability is shown above. Email delivery and job monitoring are not checked by this dashboard.</p></section>
  </section>;
}
