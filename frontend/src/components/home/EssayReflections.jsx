import { useId } from "react";
import PageContainer from "../layout/PageContainer";
import essaysSection from "../../data/essaysSection";

const EssayReflections = () => {
  const sectionId = useId();

  return (
    <PageContainer
      as="section"
      id="essays"
      aria-labelledby={`${sectionId}-heading`}
      className="scroll-mt-6 bg-bronze-soft/20 py-12 sm:py-16"
    >
      <header className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <div className="min-w-0">
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-bronze-ink">
            {essaysSection.eyebrow}
          </p>
          <h2
            id={`${sectionId}-heading`}
            className="font-serif text-3xl leading-tight text-charcoal sm:text-5xl"
          >
            {essaysSection.headline}
          </h2>
        </div>
        <p className="max-w-xl font-sans text-sm leading-7 text-muted lg:max-w-md">
          {essaysSection.intro}
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {essaysSection.essays.map((essay) => (
          <article
            key={essay.id}
            aria-labelledby={`${sectionId}-${essay.id}`}
            className="flex min-w-0 flex-col rounded-md border border-border bg-ivory p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 font-mono text-[10px] font-semibold uppercase leading-5 tracking-wider">
              <p className="text-bronze-ink">{essay.kind}</p>
              {essay.status && (
                <p className="rounded-sm border border-border bg-parchment/50 px-2 py-1 text-muted">
                  {essay.status}
                </p>
              )}
            </div>
            <h3
              id={`${sectionId}-${essay.id}`}
              className="mt-5 font-serif text-2xl font-medium leading-snug text-charcoal"
            >
              {essay.href ? (
                <a
                  href={essay.href}
                  className="rounded-sm underline-offset-4 hover:text-forest hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2"
                >
                  {essay.title}
                </a>
              ) : essay.title}
            </h3>
            <p className="mt-4 mb-7 text-sm leading-7 text-muted">{essay.summary}</p>
            <footer className="mt-auto border-t border-border pt-4">
              <p className="font-mono text-xs font-medium uppercase tracking-wide text-bronze-ink">
                {essay.author}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">{essay.relates}</p>
            </footer>
          </article>
        ))}
      </div>
    </PageContainer>
  );
};

export default EssayReflections;
