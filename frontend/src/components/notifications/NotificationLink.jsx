import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { notificationsService } from '../../services/notifications.service.js';
export default function NotificationLink() {
  const { pathname, search } = useLocation();
  const load = useCallback(async options => {
    if (pathname === '/notifications') return null; // The centre shows its own live, manually refreshed count.
    try { return await notificationsService.unreadCount(options); }
    catch (error) { if (error.status === 401) return null; throw error; }
  }, [pathname]);
  const count = useResource(load, `notification-count:${pathname}:${search}:${authService.getSessionVersion()}`);
  return <Link className="underline underline-offset-4" to="/notifications">Notifications{count.data > 0 && <span aria-label={`${count.data} unread notifications`}> ({count.data})</span>}
    {count.error && <span className="text-xs"> (unavailable)</span>}</Link>;
}
