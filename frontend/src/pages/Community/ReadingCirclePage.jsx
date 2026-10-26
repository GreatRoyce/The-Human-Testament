import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { communityService } from '../../services/community.service.js';
import DiscussionList from '../../components/community/DiscussionList.jsx';
import ModerationQueue from '../../components/community/ModerationQueue.jsx';
import { CommunityFrame, Resource, Pagination, ActionForm, Action, Field, panel, inputClass } from '../../components/community/CommunityUI.jsx';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';

function CircleMembers({ circle, reload }) {
  const [page, setPage] = useState(1);
  const load = useCallback(options => communityService.members(circle.id, { page }, options), [circle.id, page]);
  const resource = useResource(load, `members:${circle.id}:${page}:${circle.updatedAt}:${authService.getSessionVersion()}`);
  return <section className="space-y-5" aria-label="Circle members"><h2 className="font-serif text-2xl text-forest">Members</h2>
    <Resource resource={resource}>{data => <><ul className="space-y-5">{data.items.map(member => <li className={panel} key={member.user.id}>
      <p>{member.user.displayName} · {member.role} · {member.status}</p>
      {circle.canManage && circle.status === 'active' && member.role !== 'owner' && <ActionForm label="Update membership" onSave={async values => { const result = await communityService.manageMember(circle.id, member.user.id, values.action); resource.retry(); return result; }}>
        <Field label="Member action"><select name="action" className={inputClass}><option value="remove">{member.status === 'pending' ? 'Withdraw invitation' : 'Remove member'}</option>
          {member.status === 'active' && <><option value="promote">Make circle moderator</option><option value="demote">Make member</option></>}</select></Field>
      </ActionForm>}
    </li>)}</ul><Pagination pagination={data.pagination} onPage={setPage} /></>}</Resource>
    {circle.canManage && circle.status === 'active' && <ActionForm label="Invite account" reset onSave={async values => {
      const result = await communityService.manageMember(circle.id, values.userId.trim(), 'invite'); resource.retry(); reload(); return result;
    }}><Field name="userId" label="Account ID supplied by the reader" required pattern="[a-f0-9]{24}" maxLength={24} />
      <p className="text-xs text-muted">Readers can copy their invitation ID from any community page. An invitation grants access only after they accept it.</p>
    </ActionForm>}
  </section>;
}
function CircleBody({ circle, identity, reload }) {
  const [page, setPage] = useState(1), navigate = useNavigate();
  const load = useCallback(options => communityService.discussions({ circleId: circle.id, page }, options), [circle.id, page]);
  const discussions = useResource(load, `circle-discussions:${circle.id}:${page}:${authService.getSessionVersion()}`);
  const active = circle.membership?.status === 'active', verified = identity.data?.emailVerified === true;
  return <>
    <article className={panel}><h2 className="break-words font-serif text-3xl text-forest">{circle.name}</h2>
      <p className="text-sm text-muted">{circle.visibility} · {circle.status} · owned by {circle.owner.displayName}</p>
      <p className="whitespace-pre-wrap break-words leading-7">{circle.description}</p>
      {verified && !active && circle.status === 'active' && (circle.membership?.status === 'pending' || circle.membershipPolicy === 'open') &&
        <Action run={async () => { await communityService.join(circle.id); reload(); }}>Join circle</Action>}
      {verified && active && <Action run={async () => { const result = await communityService.leave(circle.id); navigate('/community/reading-circles?scope=mine'); return result; }}>{circle.canManage ? 'Archive circle and leave' : 'Leave circle'}</Action>}
    </article>
    {circle.canManage && verified && circle.status === 'active' && <details><summary className="cursor-pointer text-forest underline">Edit circle</summary>
      <ActionForm label="Save circle" onSave={async values => { await communityService.updateCircle(circle.id, values); reload(); }}>
        <Field label="Circle name" name="name" required maxLength={100} defaultValue={circle.name} />
        <Field label="Description" name="description" multiline maxLength={2000} defaultValue={circle.description} />
      </ActionForm><Action run={async () => { await communityService.updateCircle(circle.id, { status: 'archived' }); reload(); }}>Archive circle</Action>
    </details>}
    <section className="space-y-5" aria-label="Circle discussions"><h2 className="font-serif text-2xl text-forest">Circle discussions</h2>
      <Resource resource={discussions} empty="No discussions in this circle yet.">{data => <><DiscussionList items={data.items} /><Pagination pagination={data.pagination} onPage={setPage} /></>}</Resource>
      {active && verified && circle.status === 'active' && <ActionForm label="Start circle discussion" onSave={async values => {
        const verseId = values.verseId.trim(), reference = verseId ? { verseId, bookId: verseId.split(':')[0], chapterNumber: Number(verseId.split(':')[1]) } : {};
        const result = await communityService.createDiscussion({ title: values.title, body: values.body, circleId: circle.id, ...reference }); navigate('/community/discussions/' + result.id);
      }}><Field label="Discussion title" name="title" required maxLength={160} /><Field label="Your contribution" name="body" multiline required maxLength={10000} />
        <Field label="Canonical verse ID (optional)" name="verseId" maxLength={100} placeholder="freedom:10:14" /></ActionForm>}
    </section>
    {(active || circle.canManage) && <CircleMembers circle={circle} reload={reload} />}
    {verified && (circle.canManage || (active && circle.membership.role === 'moderator')) && <details className={panel}>
      <summary className="cursor-pointer text-forest">Circle moderation queue and history</summary><ModerationQueue circleId={circle.id} />
    </details>}
  </>;
}
export default function ReadingCirclePage() {
  const { id } = useParams(), identity = useCommunityIdentity();
  const load = useCallback(options => communityService.circle(id, options), [id]);
  const resource = useResource(load, `circle:${id}:${authService.getSessionVersion()}`);
  return <CommunityFrame title="Reading circle" identity={identity}><Resource resource={resource}>{circle => <CircleBody key={circle.id + ':' + circle.updatedAt} circle={circle} identity={identity} reload={resource.retry} />}</Resource></CommunityFrame>;
}
