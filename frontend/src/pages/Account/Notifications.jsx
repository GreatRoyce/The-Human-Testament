import { useCallback, useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import { authService } from '../../services/auth.service.js';
import { notificationsService } from '../../services/notifications.service.js';
import { CommunityFrame, Resource, Pagination, Action } from '../../components/community/CommunityUI.jsx';
import NotificationList from '../../components/notifications/NotificationList.jsx';
import Button from '../../components/ui/Button.jsx';
export default function Notifications() {
  const identity = useCommunityIdentity(), [page, setPage] = useState(1);
  const load = useCallback(options => Promise.all([notificationsService.list({ page }, options), notificationsService.unreadCount(options)]).then(([list, unreadCount]) => ({ ...list, unreadCount })), [page]);
  const resource = useResource(load, `notifications:${page}:${authService.getSessionVersion()}`);
  return <CommunityFrame title="Notifications" identity={identity}>
    <p className="text-sm leading-7 text-muted">Your article, discussion and circle updates. Refresh when you want the latest activity; this page does not poll in the background.</p>
    <Button variant="secondary" disabled={resource.loading} onClick={resource.retry}>Refresh notifications</Button>
    {resource.data && <p role="status" className="text-sm text-forest">{resource.data.unreadCount} unread notifications</p>}
    {resource.data?.unreadCount > 0 && <Action run={async () => { const result = await notificationsService.readAll(); resource.retry(); return { message: `${result.markedCount} notifications marked as read.` }; }}>Mark all as read</Action>}
    <Resource resource={resource} empty="You have no notifications yet.">{data => <><NotificationList items={data.items} onRead={async id => { await notificationsService.read(id); resource.retry(); return { message: 'Marked as read.' }; }} />
      <Pagination pagination={data.pagination} onPage={setPage} /></>}</Resource>
  </CommunityFrame>;
}
