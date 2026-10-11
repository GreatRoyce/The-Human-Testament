import { Link } from 'react-router-dom';
import { verseUrl } from '../../testament/utils/contentAddress.js';

export default function SearchResults({ results }) {
  return <ul className="space-y-4">
    {results.map((result) => <li key={verseUrl(result.verse)} className="rounded-soft border border-border bg-bronze-soft/10 p-5">
      <Link className="inline-flex min-h-11 items-center text-sm text-forest underline underline-offset-4" to={verseUrl(result.verse)}>{result.reference}</Link>
      <p className="font-serif text-xl leading-relaxed text-charcoal">{result.verse.text}</p>
    </li>)}
  </ul>;
}
