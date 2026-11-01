import { Link } from 'react-router-dom';
import Logo from '../branding/Logo.jsx';
import { useAuth } from '../../hooks/useAuth.js';

export default function ReaderNavbar() {
  const { authenticated } = useAuth();
  return <header className="fixed inset-x-0 top-0 z-20 border-b border-border bg-ivory">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-30 focus:rounded-soft focus:bg-forest focus:px-4 focus:py-3 focus:text-white">Skip to reading</a>
    <nav aria-label="Reading navigation" className="mx-auto flex min-h-16 max-w-content flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
      <Link to={authenticated ? '/dashboard' : '/welcome'} aria-label="The Human Testament home" className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">
        <Logo type="horizontal" alt="The Human Testament" width={145} imageClassName="h-auto max-w-full" />
      </Link>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-forest">
        <Link to="/testament" className="min-h-11 inline-flex items-center underline underline-offset-4">All books</Link>
        <Link to="/search" className="min-h-11 inline-flex items-center underline underline-offset-4">Find a passage</Link>
        {authenticated && <Link to="/reading/saved-verses" className="min-h-11 inline-flex items-center underline underline-offset-4">Library</Link>}
        <Link to={authenticated ? '/dashboard' : '/welcome'} className="min-h-11 inline-flex items-center underline underline-offset-4">{authenticated ? 'Dashboard' : 'Home'}</Link>
      </div>
    </nav>
  </header>;
}
