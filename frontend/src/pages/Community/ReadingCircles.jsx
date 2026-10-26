import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { communityService } from '../../services/community.service.js';
import { authService } from '../../services/auth.service.js';
import ReadingCircleCard from '../../components/community/ReadingCircleCard.jsx';
import { CommunityFrame, Resource, Pagination, ActionForm, Action, Field, inputClass } from '../../components/community/CommunityUI.jsx';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
export default function ReadingCircles() {
  const identity = useCommunityIdentity(), [params, setParams] = useSearchParams(), navigate = useNavigate(), query = params.toString();
  const load = useCallback(options => communityService.circles(Object.fromEntries(new URLSearchParams(query)), options), [query]);
  const resource = useResource(load, `circles:${query}:${authService.getSessionVersion()}`);
  return <CommunityFrame title="Reading circles" identity={identity}>
    <ActionForm label="Show circles" onSave={values => setParams(values.scope ? { scope: values.scope } : {})}>
      <Field label="View"><select name="scope" className={inputClass} defaultValue={params.get('scope') || ''}>
        <option value="">Public circles</option>{identity.data && <><option value="mine">My circles</option><option value="invitations">My invitations</option></>}
      </select></Field></ActionForm>
    <Resource resource={resource} empty="No circles in this view yet.">{data => <><div className="space-y-5">{data.items.map(circle => <div key={circle.id}>
      <ReadingCircleCard circle={circle} />{circle.membership?.status === 'pending' && identity.data?.emailVerified && circle.status === 'active' &&
        <><Action run={async () => { await communityService.join(circle.id); navigate('/community/reading-circles/' + circle.id); }}>Accept invitation</Action>
          <Action run={async () => { const result = await communityService.leave(circle.id); resource.retry(); return result; }}>Decline invitation</Action></>}
    </div>)}</div><Pagination pagination={data.pagination} onPage={page => { const next = new URLSearchParams(params); next.set('page', page); setParams(next); }} /></>}</Resource>
    {identity.data?.emailVerified && <details><summary className="cursor-pointer text-forest underline">Create a reading circle</summary>
      <ActionForm label="Create circle" onSave={async values => {
        const circle = await communityService.createCircle({ ...values, membershipPolicy: values.visibility === 'private' ? 'invitation' : 'open' });
        navigate('/community/reading-circles/' + circle.id);
      }}><Field label="Circle name" name="name" required maxLength={100} /><Field label="Description (optional)" name="description" multiline maxLength={2000} />
        <Field label="Visibility"><select name="visibility" className={inputClass}><option value="public">Public · open membership</option><option value="private">Private · invitation only</option></select></Field>
        <p className="text-xs text-muted">Visibility stays fixed. Owners leaving archive the circle; ownership remains for accountability.</p>
      </ActionForm></details>}
  </CommunityFrame>;
}
