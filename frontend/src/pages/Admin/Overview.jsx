import { useCallback } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { administrationService } from '../../services/administration.service.js';
import ResourceState from '../../components/shared/ResourceState.jsx';
import AdminOverview from '../../components/admin/AdminOverview.jsx';
import Button from '../../components/ui/Button.jsx';
export default function Overview() {
  const load = useCallback(options => administrationService.overview(options), []), resource = useResource(load, `admin-overview:${authService.getSessionVersion()}`);
  return <div className="space-y-6"><Button variant="secondary" disabled={resource.loading} onClick={resource.retry}>Refresh overview</Button>
    <ResourceState resource={resource}>{resource.data && <AdminOverview data={resource.data} />}</ResourceState></div>;
}
