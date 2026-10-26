import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { communityService } from '../../services/community.service.js';
import { verseLink } from '../../services/personalLibrary.js';
import DiscussionThread from '../../components/community/DiscussionThread.jsx';
import { CommunityFrame, Resource, Pagination, ActionForm, Action, Field, ReportForm, ModerationForm, panel } from '../../components/community/CommunityUI.jsx';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';

function DiscussionBody({ discussion, identity, refresh }) {
  const navigate = useNavigate(), [page, setPage] = useState(1);
  const load = useCallback(options => communityService.comments(discussion.id, { page }, options), [discussion.id, page]);
  const comments = useResource(load, `comments:${discussion.id}:${page}:${discussion.updatedAt}:${authService.getSessionVersion()}`);
  const changed = () => { comments.retry(); refresh(); };
  const verified = identity.data?.emailVerified === true;
  return <>
    {discussion.verseId && <aside className="border-l-2 border-forest p-4"><p className="text-xs uppercase tracking-widest text-muted">Canonical manuscript reference</p>
      <Link className="text-forest underline" to={verseLink(discussion.verseId)}>Read {discussion.verseId} in the manuscript</Link></aside>}
    {discussion.circleId && <Link className="text-sm text-forest underline" to={'/community/reading-circles/' + discussion.circleId}>Return to reading circle</Link>}
    <article className={panel}><p className="text-xs uppercase tracking-widest text-bronze-ink">Reader contribution · {discussion.status}</p>
      <h2 className="break-words font-serif text-3xl text-forest">{discussion.title}</h2>
      <p className="text-sm text-muted">By {discussion.author.displayName} · <time dateTime={discussion.createdAt}>{discussion.createdAt.slice(0, 10)}</time></p>
      <p className="whitespace-pre-wrap break-words leading-8">{discussion.body}</p>
      {discussion.canEdit && verified && <details><summary className="cursor-pointer text-forest underline">Edit or remove your discussion</summary>
        <ActionForm label="Save discussion" onSave={async values => { await communityService.updateDiscussion(discussion.id, values); refresh(); }}>
          <Field label="Title" name="title" required maxLength={160} defaultValue={discussion.title} />
          <Field label="Your contribution" name="body" multiline required maxLength={10000} defaultValue={discussion.body} />
        </ActionForm>
      </details>}
      {discussion.canDelete && verified && <Action run={async () => { await communityService.deleteDiscussion(discussion.id); navigate(discussion.circleId ? '/community/reading-circles/' + discussion.circleId : '/community/discussions'); }}>Remove discussion</Action>}
      <ReportForm enabled={verified} targetType="discussion" targetId={discussion.id} />
    </article>
    {discussion.canModerate && verified && <ModerationForm targetType="discussion" targetId={discussion.id} onDone={refresh} />}
    <section aria-label="Reader comments" className="space-y-5"><h2 className="font-serif text-2xl text-forest">Comments</h2>
      <p className="text-sm text-muted">Flat replies, oldest first. Removed or hidden comments are omitted from counts and lists.</p>
      <Resource resource={comments} empty="No comments yet.">{data => <><DiscussionThread items={data.items} canReport={verified} canModerate={discussion.canModerate && verified} onChanged={changed} />
        <Pagination pagination={data.pagination} onPage={setPage} /></>}</Resource>
      {verified && discussion.canComment ? <ActionForm label="Post comment" reset onSave={async values => { await communityService.createComment(discussion.id, values); changed(); }}>
        <Field label="Your comment" name="body" multiline required maxLength={5000} /></ActionForm> :
        <p className="text-sm text-muted">Commenting requires a verified account, an open discussion, and active membership for circle discussions.</p>}
    </section>
  </>;
}
export default function DiscussionPage() {
  const { id } = useParams(), identity = useCommunityIdentity();
  const load = useCallback(options => communityService.discussion(id, options), [id]);
  const resource = useResource(load, `discussion:${id}:${authService.getSessionVersion()}`);
  return <CommunityFrame title="Reader discussion" identity={identity}><Resource resource={resource}>{discussion =>
    <DiscussionBody key={discussion.id + ':' + discussion.updatedAt} discussion={discussion} identity={identity} refresh={resource.retry} />}</Resource></CommunityFrame>;
}
