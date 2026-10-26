import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { administrationService } from '../../services/administration.service.js';
import ResourceState from '../../components/shared/ResourceState.jsx';
import AccountStatusForm from '../../components/admin/AccountStatusForm.jsx';
import AdminAudit from '../../components/admin/AdminAudit.jsx';
export default function UserDetails() {
  const { id } = useParams(), load = useCallback(options => administrationService.user(id, options), [id]);
  const resource = useResource(load, `admin-user:${id}:${authService.getSessionVersion()}`);
  return <ResourceState resource={resource}>{resource.data && <section className="space-y-7"><h2 className="break-words font-serif text-3xl text-forest">{resource.data.displayName}</h2>
    <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>Email</dt><dd className="break-all">{resource.data.email}</dd></div><div><dt>Status</dt><dd>{resource.data.isActive ? 'Active' : 'Deactivated'}</dd></div>
      <div><dt>Registered</dt><dd>{resource.data.createdAt}</dd></div><div><dt>Email ownership</dt><dd>{resource.data.emailVerified ? 'Verified' : 'Unverified'}</dd></div>
      <div><dt>Base role</dt><dd>{resource.data.role}</dd></div><div><dt>Granted permissions</dt><dd>{Object.entries(resource.data.permissions).filter(([, value]) => value).map(([key]) => key).join(', ') || 'None'}</dd></div></dl>
    <AccountStatusForm key={String(resource.data.isActive)} user={resource.data} onDone={resource.retry} />
    <AdminAudit key={resource.data.updatedAt} targetType="user" targetId={id} title="Account status history" />
    <AdminAudit targetType="admin_permission" targetId={id} title="Administration access history" />
  </section>}</ResourceState>;
}
