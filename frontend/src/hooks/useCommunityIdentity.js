import { useCallback } from 'react';
import { useResource } from './useResource.js';
import { authService } from '../services/auth.service.js';
export function useCommunityIdentity() {
  const version = authService.getSessionVersion();
  const load = useCallback(async options => {
    try { return await authService.getCurrentUser(options); }
    catch (error) { if (error.status === 401) return null; throw error; }
  }, []);
  return useResource(load, `community-identity:${version}`);
}
