import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { administrationService } from '../../services/administration.service.js';
import { Resource, Pagination, ActionForm, Field, inputClass } from '../../components/community/CommunityUI.jsx';
export default function Users() {
  const [page, setPage] = useState(1), [filters, setFilters] = useState({});
  const load = useCallback(options => administrationService.users({ ...filters, page }, options), [filters, page]);
  const resource = useResource(load, `admin-users:${JSON.stringify(filters)}:${page}:${authService.getSessionVersion()}`);
  return <section className="space-y-6"><h2 className="font-serif text-3xl text-forest">User management</h2>
    <p className="text-sm text-muted">Account identity and status only. Privileged grants are displayed separately from the base User role. Role changes use the authorized operator process.</p>
    <ActionForm label="Find users" onSave={values => { setPage(1); setFilters(values); }}><Field label="Name or email (literal text)" name="q" maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Role or permission"><select name="role" className={inputClass}><option value="">All accounts</option><option value="user">User (base role)</option><option value="administrator">Administration permission</option><option value="admin">Analytics Admin grant</option><option value="owner">Analytics Owner grant</option><option value="moderator">Global moderator grant</option></select></Field>
        <Field label="Account status"><select name="status" className={inputClass}><option value="">All statuses</option><option value="active">Active</option><option value="deactivated">Deactivated</option></select></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Registered from (UTC; set both dates)" name="start" type="date" /><Field label="Registered through (UTC)" name="end" type="date" /></div>
    </ActionForm>
    <Resource resource={resource} empty="No accounts match these filters.">{data => <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col">Account</th><th scope="col">Status</th><th scope="col">Registered</th><th scope="col">Permissions</th></tr></thead>
      <tbody>{data.items.map(user => <tr className="border-t border-border" key={user.id}><td className="py-4 pr-5"><Link className="text-forest underline" to={'/admin/users/' + user.id}>{user.displayName}</Link><p className="break-all text-xs text-muted">{user.email}</p></td><td className="pr-5">{user.isActive ? 'Active' : 'Deactivated'}</td><td className="pr-5">{user.createdAt.slice(0, 10)}</td><td>{Object.entries(user.permissions).filter(([, enabled]) => enabled).map(([name]) => name).join(', ') || 'User'}</td></tr>)}</tbody></table></div>
      <Pagination label="User pagination" pagination={data.pagination} onPage={setPage} /></>}</Resource>
  </section>;
}
