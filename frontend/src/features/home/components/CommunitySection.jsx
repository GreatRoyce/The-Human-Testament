import PageContainer from "../../../components/layout/PageContainer";
import circlesSection from "../../../data/circleSection";
import { Link } from "react-router-dom";

const CommunitySection = () => {
  return (
    <PageContainer
      as="section"
      id="community"
      aria-labelledby={`community-heading`}
      className="scroll-mt-6 grid grid-cols-1 gap-8 bg-ivory py-10 sm:gap-10 sm:py-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12"
    >
      <div className="min-w-0">
        <header className="flex flex-col gap-5 border-b border-border pb-6 sm:pb-7">
          <div className="min-w-0">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-bronze-ink">
              {circlesSection.eyebrow}
            </p>
            <h2
              id={`community-heading`}
              className="break-words font-serif text-3xl leading-tight text-charcoal sm:text-4xl lg:text-5xl"
            >
              {circlesSection.headline}
            </h2>
          </div>
        </header>
        <p className="my-3 max-w-xl break-words font-sans text-sm leading-7 text-muted">
          {circlesSection.body}
        </p>
        <p className="my-3 max-w-xl break-words font-sans text-sm leading-7 text-muted">
          {circlesSection.secondary}
        </p>
        <Link to="/community/reading-circles" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded bg-bronze-ink/20 px-5 py-3 text-center text-xs font-semibold text-forest transition-colors hover:bg-bronze-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 sm:mt-6 sm:w-auto sm:px-6">
          {circlesSection.cta}
        </Link>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4">
        {circlesSection.circles.map((circle, index) => (
          <article className="flex min-w-0 flex-col gap-3 rounded-lg bg-bronze-soft/20 p-4 text-xs sm:p-5" key={circle.id ?? index}>
            <div className="flex min-w-0 flex-col items-start gap-1 text-[10px] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <h3 className="break-words font-mono font-medium text-bronze">
                {circle.status}
              </h3>
              <p className="break-words font-sans text-forest sm:text-right">{circle.meta}</p>
            </div>
            <p className="break-words font-serif text-xl leading-snug text-charcoal sm:text-2xl">{circle.title}</p>
            <p className="break-words font-sans text-xs leading-6 text-muted">{circle.summary}</p>
            <div className="flex min-w-0 flex-col items-start gap-3 border-t border-border/70 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pt-4">
              <p className="break-words text-charcoal/90">{circle.scope}</p>
              <Link to={circle.href ?? "/community/reading-circles"} className="inline-flex min-h-11 w-full items-center justify-center rounded-sm px-2 text-center font-semibold text-forest underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest sm:w-auto sm:shrink-0">
                {circle.cta}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </PageContainer>
  );
};

export default CommunitySection;
