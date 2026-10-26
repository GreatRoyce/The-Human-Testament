import { administrationService } from '../../services/administration.service.js';
import { ActionForm, Field } from '../community/CommunityUI.jsx';
export default function AccountStatusForm({ user, onDone }) {
  const label = user.isActive ? 'Deactivate account' : 'Reactivate account';
  return <ActionForm label={label} confirmation={`${label} for ${user.displayName} (${user.email})? Sessions and recovery credentials will be revoked. Reactivation requires a new login. Administrators cannot change their own status.`}
    onSave={async ({ reason }) => { const result = await administrationService.setStatus(user.id, { isActive: !user.isActive, expectedIsActive: user.isActive, reason }); onDone(); return result; }}>
    <p className="text-sm">This change is recorded in the audit history. Reload after a status conflict.</p><Field label="Safe reason (never include passwords, tokens or private notes)" name="reason" required multiline maxLength={1000} />
  </ActionForm>;
}
