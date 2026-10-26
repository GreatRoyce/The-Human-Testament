import { useOutletContext } from 'react-router-dom';
import ModerationQueue from '../../components/community/ModerationQueue.jsx';
export default function Community({ reports = false }) {
  const capabilities = useOutletContext();
  return <section className="space-y-6"><h2 className="font-serif text-3xl text-forest">{reports ? 'Content reports' : 'Community moderation'}</h2>
    <p className="max-w-reading text-sm leading-7 text-muted">Reports drive moderation of published discussions and comments. Resolving a report records a reason; explain whether it was dismissed or action was taken. Private circle access rules still apply. Account restrictions are available through User management.</p>
    {capabilities.globalModerator ? <ModerationQueue key={String(reports)} initialTargetType={reports ? '' : 'discussion'} articleReviewBase="/admin/articles/" /> : <p role="status">Community moderation and reports require a separately provisioned global moderator grant.</p>}
  </section>;
}
