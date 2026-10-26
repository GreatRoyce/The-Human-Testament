import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { analyticsTracker } from '../../services/analyticsTracker.js';
import Button from '../ui/Button.jsx';
export default function AnalyticsTracking() {
  const { pathname } = useLocation();
  const [revision, update] = useState(0), [choice, setChoice] = useState('deny');
  useEffect(() => {
    const refresh = () => { setChoice(analyticsTracker.preference()); update(value => value + 1); };
    refresh(); window.addEventListener('storage', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { analyticsTracker.track(pathname); }, [pathname, revision]);
  if (!analyticsTracker.enabled) return null;
  const choose = allow => { analyticsTracker.setConsent(allow); setChoice(analyticsTracker.preference()); update(value => value + 1); };
  return <aside aria-label="Optional website analytics" className="border-t border-border bg-parchment px-5 py-5 text-sm text-forest">
    <div className="mx-auto flex max-w-content flex-wrap items-center gap-4"><p className="max-w-reading">Optional analytics are {choice === 'allow' ? 'on' : 'off'}. Share public page visits to help improve the site. Estimated browsers are not individual people. <Link to="/privacy" className="underline">Privacy details</Link></p>
      {choice === 'blocked' || choice === 'unavailable' ? <p>Browser privacy settings or storage prevent tracking.</p> : <>
        <Button variant="secondary" disabled={choice === 'allow'} onClick={() => choose(true)}>Allow analytics</Button>
        <Button variant="secondary" disabled={choice !== 'allow'} onClick={() => choose(false)}>Keep analytics off</Button></>}
    </div>
  </aside>;
}
