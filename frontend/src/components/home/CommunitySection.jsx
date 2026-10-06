import PageContainer from "../layout/PageContainer";
import circlesSection from "../../data/circleSection";

const CommunitySection = () => {
  return (
    <PageContainer
      as="section"
      id="community"
      aria-labelledby={`community-heading`}
      className="scroll-mt-6 bg-ivory py-12 sm:py-16 grid grid-cols-[2fr_3fr] gap-8"
    >
      <div className="">
        <header className="flex flex-col gap-5 border-b border-border pb-7 ">
          <div className="">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-bronze-ink">
              {circlesSection.eyebrow}
            </p>
            <h2
              id={`community-heading`}
              className="font-serif text-3xl leading-tight text-charcoal sm:text-5xl"
            >
              {circlesSection.headline}
            </h2>
          </div>
        </header>
        <p className="max-w-xl font-sans text-sm leading-7 my-2 text-muted lg:max-w-xl">
          {circlesSection.body}
        </p>
        <p className="max-w-xl font-sans text-sm leading-7 my-2 text-muted lg:max-w-xl">
          {circlesSection.secondary}
        </p>
        <button className="mt-6 rounded bg-bronze-ink/20 px-6 py-2 text-xs font-semibold text-forest hover:bg-bronze-ink/80">
          {circlesSection.cta}
        </button>
      </div>

      <div className=" grid grid-cols-1 gap-4">
        {circlesSection.circles.map((circle, index) => (
          <div className="p-4 flex flex-col space-y-2 text-xs bg-bronze-soft/20 rounded-lg" key={index}>
            <div className="flex justify-between textshade items-center text-[10px]">
              <h3 className="font-mono font-medium text-bronze">
                {circle.status}
              </h3>
              <p className="font-sans text-forest">{circle.meta}</p>
            </div>
            <p className="font-serif text-2xl ">{circle.title}</p>
            <p className="font-sans tracking wide text-xs text-muted">{circle.summary}</p>
            <div className="flex justify-between items-center pt-4 text-xs">
              <p className="text-charcoal/90">{circle.scope}</p>
              <button className="text-forest font-semibold">{circle.cta}</button>
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
};

export default CommunitySection;
