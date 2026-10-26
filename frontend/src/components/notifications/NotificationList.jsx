import { Link } from 'react-router-dom';
import { Action, panel } from '../community/CommunityUI.jsx';
export default function NotificationList({ items, onRead }) {
  return <ul className="space-y-5" aria-label="Your notifications">{items.map(item => <li className={panel} key={item.id}>
    <div className="flex flex-wrap justify-between gap-3 text-xs text-muted"><p>{item.readAt ? 'Read' : 'Unread'}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
    {item.actor && <p className="break-words text-sm text-muted">{item.actor.displayName}</p>}
    <p className="break-words leading-7 text-forest">{item.message}</p>
    {item.targetUrl ? <Link className="text-sm text-forest underline" to={item.targetUrl}>Open related activity</Link> :
      <p className="text-xs leading-6 text-muted">{item.type === 'unavailable' ? 'The resource is unavailable or you no longer have access.' : 'This update has no accessible resource link.'}</p>}
    {!item.readAt && <Action run={() => onRead(item.id)}>Mark as read</Action>}
  </li>)}</ul>;
}
