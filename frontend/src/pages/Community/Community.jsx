import { Link } from 'react-router-dom';
import { CommunityFrame } from '../../components/community/CommunityUI.jsx';
import { useCommunityIdentity } from '../../hooks/useCommunityIdentity.js';
export default function Community() {
  const identity = useCommunityIdentity();
  return <CommunityFrame title="Community" identity={identity}><p className="leading-7 text-muted">Explore readers’ discussions, connect a question to a manuscript passage, or read together in a circle.</p>
    <p><Link className="underline text-forest" to="/community/discussions">Explore discussions</Link></p>
    <p><Link className="underline text-forest" to="/community/reading-circles">Explore reading circles</Link></p>
  </CommunityFrame>;
}
