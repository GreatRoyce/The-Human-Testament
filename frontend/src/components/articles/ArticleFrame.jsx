import { Link } from 'react-router-dom';
import { CommunityFrame } from '../community/CommunityUI.jsx';
export default function ArticleFrame({ title, identity, children }) {
  return <CommunityFrame title={title} identity={identity}><nav aria-label="Article navigation" className="flex flex-wrap gap-5 text-sm text-forest">
    <Link className="underline" to="/articles">Published articles</Link>{identity.data && <><Link className="underline" to="/articles/mine">My articles</Link><Link className="underline" to="/articles/write">Write an article</Link></>}
  </nav>{children}</CommunityFrame>;
}
