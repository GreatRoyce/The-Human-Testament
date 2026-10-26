import DiscussionCard from './DiscussionCard.jsx';
export default function DiscussionList({ items }) { return <div className="space-y-5">{items.map(item => <DiscussionCard key={item.id} discussion={item} />)}</div>; }
