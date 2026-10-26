import ContentPage from '../../components/layout/ContentPage.jsx';
import ResourceState from '../../components/shared/ResourceState.jsx';
import { useManuscriptSections } from '../../features/testament/hooks/useManuscriptSections.js';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export default function ManuscriptMaterials() {
  const sections = useManuscriptSections();
  const { hash } = useLocation();
  const scrolled = useRef('');
  useEffect(() => {
    if (!hash) { scrolled.current = ''; return; }
    if (!sections.data || scrolled.current === hash || !/^#source-line-[1-9][0-9]*$/.test(hash)) return;
    const target = document.getElementById(hash.slice(1));
    if (target) { target.scrollIntoView({ block: 'center', behavior: 'auto' }); scrolled.current = hash; }
  }, [hash, sections.data]);
  const title = section => section.marker.match(/MATTER: ([^·]+)/)?.[1].trim() ?? 'Manuscript section';
  return <ContentPage title="From the manuscript">
    <p className="mb-6 text-sm leading-7 text-muted">The opening pages, closing text, cross-reference index, and glossary, as they appear in the PDF.</p>
    <ResourceState resource={sections} empty={sections.data?.length === 0}>
      <nav aria-label="Manuscript sections" className="mb-8 flex flex-wrap gap-4">
        {sections.data?.map(section => <a key={section.sourceLine} className="text-sm text-forest underline underline-offset-4" href={`#section-${section.sourceLine}`}>{title(section)}</a>)}
      </nav>
      {sections.data?.map(section => <section key={section.sourceLine} id={`section-${section.sourceLine}`} className="mb-10 max-w-reading scroll-mt-6">
        <h2 className="mb-4 font-serif text-2xl text-forest">{title(section)}</h2>
        {section.lines.map((line, index) => <p key={index} id={`source-line-${line.line}`} className="mb-4 scroll-mt-24 whitespace-pre-wrap font-serif text-lg leading-relaxed text-charcoal">{line.raw}</p>)}
      </section>)}
    </ResourceState>
  </ContentPage>;
}
