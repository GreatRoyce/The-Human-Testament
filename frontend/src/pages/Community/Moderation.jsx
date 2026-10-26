import { useCallback } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { authService } from '../../services/auth.service.js';
import { communityService } from '../../services/community.service.js';
import { CommunityFrame, Resource } from '../../components/community/CommunityUI.jsx';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
import ModerationQueue from '../../components/community/ModerationQueue.jsx';
export default function Moderation() {
  const identity = useCommunityIdentity(), load = useCallback(options => communityService.capabilities(options), []);
  const capability = useResource(load, `moderation-capability:${authService.getSessionVersion()}`);
  return <CommunityFrame title="Community moderation" identity={identity}><Resource resource={capability}>{data => data.globalModerator ? <ModerationQueue /> :
    <p role="alert">This area requires a separately provisioned moderator account. Circle moderators use the moderation queue within their circle.</p>}</Resource></CommunityFrame>;
}
