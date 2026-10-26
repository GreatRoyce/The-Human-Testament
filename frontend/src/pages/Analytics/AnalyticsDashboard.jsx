import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import Button from '../../components/ui/Button.jsx';
import AnalyticsSummary from '../../components/analytics/AnalyticsSummary.jsx';
import { analyticsService } from '../../services/analytics.service.js';
import { authService } from '../../services/auth.service.js';
import { useResource } from '../../hooks/useResource.js';
export default function AnalyticsDashboard({ scope }) {
  const [days, setDays] = useState('7'), [interval, setInterval] = useState('day');
  const load = useCallback(options => analyticsService.report(scope, { days, interval }, options), [scope, days, interval]);
  const resource = useResource(load, `analytics:${scope}:${days}:${interval}:${authService.getSessionVersion()}`);
  const denied = [401, 403].includes(resource.error?.status);
  return <ContentPage title={`${scope === 'owner' ? 'Owner' : 'Admin'} analytics`}>
    <p className="mb-6 text-muted">{scope === 'owner' ? 'Overall performance of public pages.' : 'Platform traffic and analytics collection status.'} Access requires a separately granted {scope} analytics permission.</p>
    {scope === 'admin' && <p className="mb-5 text-sm text-forest"><Link className="underline" to="/admin">Administration overview (separate permission required)</Link></p>}
    <div className="mb-7 flex flex-wrap items-end gap-5"><label className="space-y-2 text-sm text-forest"><span className="block">Date range</span><select className="min-h-11 rounded-sm border border-border bg-ivory p-2" value={days} onChange={event => setDays(event.target.value)}>{['7', '30', '90'].map(value => <option value={value} key={value}>Last {value} days</option>)}</select></label>
      <label className="space-y-2 text-sm text-forest"><span className="block">Trend interval</span><select className="min-h-11 rounded-sm border border-border bg-ivory p-2" value={interval} onChange={event => setInterval(event.target.value)}>{['day', 'week', 'month'].map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <Button variant="secondary" onClick={resource.retry} disabled={resource.loading}>Refresh analytics</Button>
    </div>
    {denied ? <p role="alert">{resource.error.status === 401 ? <Link to="/login" state={{ returnTo: `/${scope}/analytics` }} className="underline">Log in to view analytics.</Link> : `Your account does not have ${scope} analytics permission.`}</p> :
      <ResourceState resource={resource}>{!resource.loading && !resource.error && resource.data && <AnalyticsSummary data={resource.data} />}</ResourceState>}
  </ContentPage>;
}
