import { useSyncExternalStore } from 'react';
import { authService } from '../services/auth.service.js';

export function useAuth() {
  const session = useSyncExternalStore(
    authService.subscribe,
    authService.getSessionSnapshot,
    authService.getSessionSnapshot,
  );
  return { user: session.user, authenticated: Boolean(session.user) };
}