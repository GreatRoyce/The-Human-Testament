import { Link } from 'react-router-dom';
import PageContainer from './PageContainer.jsx';

export default function ContentPage({ title, children }) {
  return <PageContainer as="main" id="main-content" tabIndex={-1} className="min-h-screen bg-ivory pb-16 pt-28">
    <nav aria-label="Reading navigation" className="mb-6 flex flex-wrap gap-5 text-sm text-forest">
      <Link className="underline underline-offset-4" to="/">Home</Link>
      <Link className="underline underline-offset-4" to="/testament">The Testament</Link>
      <Link className="underline underline-offset-4" to="/search">Search</Link>
    </nav>
    <h1 className="mb-7 font-serif text-4xl text-forest sm:text-5xl">{title}</h1>
    {children}
  </PageContainer>;
}
