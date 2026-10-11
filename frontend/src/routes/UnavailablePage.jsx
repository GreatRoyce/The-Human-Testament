import { Link } from 'react-router-dom';
import PageContainer from '../components/layout/PageContainer.jsx';

export default function UnavailablePage() {
  return <PageContainer as="main" id="main-content" tabIndex={-1} className="min-h-[calc(100svh-4rem)] py-20 text-center">
    <h1 className="font-serif text-4xl text-forest sm:text-5xl">Page unavailable</h1>
    <p className="mx-auto mt-4 max-w-reading text-muted">This page is not available yet. You can continue exploring The Human Testament from the home page.</p>
    <Link to="/" className="mt-8 inline-flex min-h-11 items-center justify-center rounded-soft bg-forest px-6 py-3 text-sm text-white hover:bg-forest-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">Return home</Link>
  </PageContainer>;
}
