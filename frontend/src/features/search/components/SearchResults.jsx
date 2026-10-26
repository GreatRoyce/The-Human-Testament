import { Link } from 'react-router-dom';
import { searchResultUrl, searchTargetUrl } from '../utils/searchAddress.js';

export default function SearchResults({ results }) {
  return <ul className="space-y-4">
    {results.map(result => {
      const url = searchResultUrl(result);
      return <li key={result.id ?? url ?? result.reference} className="space-y-3 rounded-soft border border-border bg-bronze-soft/10 p-5">
        <p className="font-mono text-xs text-bronze-ink">{{ verse: 'Canonical verse', note: 'Supporting note / reflection', glossary: 'Glossary entry', 'cross-reference': 'Cross-reference' }[result.kind]}</p>
        {url ? <Link className="inline-flex min-h-11 items-center text-sm text-forest underline underline-offset-4" to={url}>{result.reference}</Link> : <p className="text-sm text-forest">{result.reference} · Source location unavailable</p>}
        {result.kind === 'verse' && <p className="whitespace-pre-wrap break-words font-serif text-xl leading-relaxed text-charcoal">{result.verse.status === 'missing_source_text' ? 'Source text is missing. This reference remains under review.' : result.verse.text}</p>}
        {result.kind === 'note' && <>
          <p className="whitespace-pre-wrap break-words font-mono text-xs text-muted">{result.note.markerText}</p>
          {result.note.anchor.status === 'inferred' && <p className="text-xs text-muted">Anchor inferred · awaiting human review</p>}
          {result.note.reviewRequired && result.note.anchor.status !== 'inferred' && <p className="text-xs text-muted">Source review required</p>}
          <p className="whitespace-pre-wrap break-words font-serif text-lg leading-relaxed text-charcoal">{result.note.rawText}</p>
        </>}
        {result.kind === 'glossary' && <><p className="text-sm text-muted">{result.entry.bookTag}</p><p className="whitespace-pre-wrap break-words font-serif text-lg leading-relaxed text-charcoal">{result.entry.definition}</p></>}
        {result.kind === 'cross-reference' && <>
          <p className="text-xs text-muted">{result.origin === 'index' ? 'Printed cross-reference index' : 'Supporting-note citation'}</p>
          <p className="whitespace-pre-wrap break-words font-serif text-lg leading-relaxed text-charcoal">{result.entry.raw}</p>
          {result.anchorStatus !== 'explicit' && <p className="text-xs text-muted">{result.anchorStatus === 'inferred' ? 'Anchor inferred' : 'Anchor not verified'} · awaiting human review</p>}
          {result.reviewRequired && <p className="text-xs text-muted">Citation requires review</p>}
          <ul className="space-y-2 text-sm">{result.entry.targets.map((target, index) => {
            const targetUrl = searchTargetUrl(target);
            return <li key={index}>{targetUrl ? <Link className="text-forest underline underline-offset-4" to={targetUrl}>{target.raw}</Link> : <span className="text-muted">{target.raw}</span>}
              {target.status !== 'resolved' && <span className="text-xs text-muted"> · {target.status.replace(/_/g, ' ')}</span>}</li>;
          })}</ul>
        </>}
      </li>;
    })}
  </ul>;
}
