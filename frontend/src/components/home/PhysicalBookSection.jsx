import { useId, useState } from "react";
import PageContainer from "../layout/PageContainer";
import printedSection from "../../data/printedSection";
import Button from "../ui/Button";

const PhysicalBookSection = () => {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;
  const specificationsId = `${sectionId}-specifications`;
  const availabilityId = `${sectionId}-availability`;
  const [showSpecifications, setShowSpecifications] = useState(false);
  const orderingUnavailable = printedSection.ctas.some(
    (item) => item.style === "primary" && !item.href,
  );

  return (
    <PageContainer
      as="section"
      id="printed-book"
      aria-labelledby={headingId}
      className="my-8 scroll-mt-6 bg-ivory py-10 sm:my-12 sm:py-12"
    >
      <div className="overflow-hidden rounded-soft border border-border bg-white/70">
        <div className="grid items-center gap-10 p-6 sm:p-10 lg:grid-cols-[3fr_2fr] lg:gap-12 lg:p-12">
          <div className="min-w-0">
            <header>
              <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-bronze-ink">
                {printedSection.eyebrow}
              </p>
              <h2
                id={headingId}
                className="font-serif text-3xl font-normal leading-tight text-charcoal sm:text-5xl"
              >
                {printedSection.headline}
              </h2>
            </header>
            <p className="mt-5 max-w-xl font-sans text-sm leading-7 text-muted">
              {printedSection.body}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {printedSection.ctas.map((item) => {
                const isSpecifications = item.label === "VIEW SPECIFICATIONS";
                const actionClasses = "min-h-11 h-auto w-full px-5 py-3 text-center text-[11px] leading-5 sm:w-auto";

                if (item.href) {
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      className={`inline-flex items-center justify-center rounded-soft font-sans font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 motion-reduce:transition-none ${actionClasses} ${
                        item.style === "secondary"
                          ? "border border-forest text-forest hover:bg-parchment"
                          : "bg-forest text-white hover:bg-forest-deep"
                      }`}
                    >
                      {item.label}
                    </a>
                  );
                }

                return (
                  <Button
                    key={item.label}
                    variant={item.style}
                    className={actionClasses}
                    rightIcon={null}
                    disabled={!isSpecifications}
                    aria-describedby={!isSpecifications && orderingUnavailable ? availabilityId : undefined}
                    aria-controls={isSpecifications ? specificationsId : undefined}
                    aria-expanded={isSpecifications ? showSpecifications : undefined}
                    onClick={isSpecifications ? () => setShowSpecifications((open) => !open) : undefined}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>
            {orderingUnavailable && (
              <p id={availabilityId} className="mt-3 text-xs leading-5 text-muted">
                Ordering is not available yet.
              </p>
            )}

            <dl
              id={specificationsId}
              hidden={!showSpecifications}
              className="mt-6 border-t border-border pt-5"
            >
              {printedSection.specs.map((item) => (
                <div key={item.label} className="grid gap-1 py-2 sm:grid-cols-[7rem_1fr] sm:gap-4">
                  <dt className="font-mono text-[10px] tracking-widest text-bronze-ink">
                    {item.label}
                  </dt>
                  <dd className="font-serif text-base leading-6 text-charcoal">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <figure className="flex justify-center rounded-soft bg-parchment/40 px-4 py-8 sm:py-10">
            <div className="flex aspect-[2/3] w-48 max-w-full flex-col border-l-[6px] border-bronze-soft/30 bg-forest-deep p-4 sm:w-56 sm:p-5">
              <div className="flex flex-1 flex-col items-center border border-bronze-soft/40 px-3 py-6 text-center">
                <span aria-hidden="true" className="mb-5 h-px w-7 bg-bronze-soft" />
                <p className="font-serif text-2xl leading-tight tracking-wide text-ivory sm:text-3xl">
                  {printedSection.cover.title}
                </p>
                <p className="mt-4 font-sans text-[10px] tracking-[0.18em] text-bronze-soft">
                  {printedSection.cover.subtitle}
                </p>
                <div className="mt-auto pt-8">
                  <p className="font-sans text-[10px] tracking-widest text-ivory/90">
                    {printedSection.cover.author}
                  </p>
                  <p className="mt-2 font-serif text-xs text-ivory/70">
                    {printedSection.cover.publisher}
                  </p>
                </div>
              </div>
            </div>
          </figure>
        </div>

        <dl className="grid grid-cols-2 border-t border-border sm:grid-cols-4">
          {printedSection.stats.map((item, index) => (
            <div
              key={item.label}
              className={`flex min-w-0 flex-col items-center gap-2 px-3 py-6 sm:py-7 ${
                index % 2 === 0 ? "border-r border-border" : ""
              } ${index >= 2 ? "border-t border-border sm:border-t-0" : ""} ${
                index === 1 ? "sm:border-r sm:border-border" : ""
              }`}
            >
              <dt className="order-2 font-mono text-[10px] font-medium tracking-widest text-bronze-ink">
                {item.label}
              </dt>
              <dd className="font-serif text-4xl font-medium leading-none text-forest sm:text-5xl">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </PageContainer>
  );
};

export default PhysicalBookSection;
