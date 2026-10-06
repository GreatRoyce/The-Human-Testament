import { Link } from "react-router-dom";
import PageContainer from "../../components/layout/PageContainer";

const LegalPage = ({ title, introduction, sections }) => (
  <main
    id="main-content"
    tabIndex={-1}
    className="min-h-[calc(100svh-4rem)] bg-ivory py-12 sm:py-20"
  >
    <PageContainer size="reading">
      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-bronze-ink">
        The Human Testament
      </p>
      <h1 className="mt-3 font-serif text-4xl text-forest sm:text-5xl">
        {title}
      </h1>
      <p className="mt-5 text-sm leading-7 text-muted">{introduction}</p>

      <div className="mt-8 space-y-7">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-serif text-2xl text-charcoal">
              {section.heading}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              {section.body}
            </p>
          </section>
        ))}
      </div>

      <Link
        className="mt-10 inline-flex min-h-11 items-center rounded-soft border border-forest px-5 py-3 text-sm text-forest hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2"
        to="/"
      >
        Return to the home page
      </Link>
    </PageContainer>
  </main>
);

export default LegalPage;
