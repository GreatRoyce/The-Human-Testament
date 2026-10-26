import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { administrationService } from '../../services/administration.service.js';
export default function AdminLink() {
  const load = useCallback(options => administrationService.capabilities(options).catch(() => null), []);
  const resource = useResource(load, `administration-link:${authService.getSessionVersion()}`);
  return resource.data?.administration ? <Link to="/admin" className="underline">Administration</Link> : null;
}
