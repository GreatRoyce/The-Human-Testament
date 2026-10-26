import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { analyticsEnabled } from '../../services/analyticsTracker.js';
import { analyticsService } from '../../services/analytics.service.js';
import { authService } from '../../services/auth.service.js';
import { useResource } from '../../hooks/useResource.js';
export default function AnalyticsLinks() {
  const load = useCallback(options => analyticsEnabled ? analyticsService.capabilities(options).catch(() => null) : Promise.resolve(null), []);
  const resource = useResource(load, `analytics-links:${authService.getSessionVersion()}`);
  return <>{resource.data?.owner && <Link className="underline" to="/owner/analytics">Owner analytics</Link>}{resource.data?.admin && <Link className="underline" to="/admin/analytics">Admin analytics</Link>}</>;
}
