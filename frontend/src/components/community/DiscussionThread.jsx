import { Action, ActionForm, Field, ModerationForm, ReportForm, panel } from './CommunityUI.jsx';
import { communityService } from '../../services/community.service.js';
export default function DiscussionThread({ items, canReport, canModerate, onChanged }) {
  return <div className="space-y-5">{items.map(comment => <article key={comment.id} className={panel} aria-label="Reader comment">
    <p className="text-sm text-muted">By {comment.author.displayName} · <time dateTime={comment.createdAt}>{comment.createdAt.slice(0, 10)}</time></p>
    <p className="whitespace-pre-wrap break-words text-sm leading-7">{comment.body}</p>
    {comment.canEdit && <details><summary className="cursor-pointer text-sm text-forest underline">Edit or remove your comment</summary>
      <ActionForm label="Save comment" onSave={async values => { await communityService.updateComment(comment.id, values); onChanged(); }}>
        <Field label="Your comment" name="body" multiline required maxLength={5000} defaultValue={comment.body} />
      </ActionForm><Action run={async () => { await communityService.deleteComment(comment.id); onChanged(); }}>Remove comment</Action>
    </details>}
    <ReportForm targetType="comment" targetId={comment.id} enabled={canReport} />
    {canModerate && <ModerationForm targetType="comment" targetId={comment.id} onDone={onChanged} />}
  </article>)}</div>;
}
