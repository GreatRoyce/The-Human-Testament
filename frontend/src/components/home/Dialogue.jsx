import PageContainer from "../layout/PageContainer";
import { GoDash, GoDotFill } from "react-icons/go";
import { Link } from "react-router-dom";
import { dialogueCards } from "../../data/dialogueCards";

const Dialogue = () => {
  return (
    <PageContainer as="section" id="think-together" tabIndex={-1} aria-labelledby="dialogue-heading" className="bg-white/50 pt-8 scroll-mt-6">
      <div className="flex items-center pt-4 my-8 space-x-1 tracking-widest font-mono uppercase text-xs font-semibold text-bronze-ink">
        <GoDash aria-hidden="true" />
        <p>THE LIVING DIALOGUE</p>
      </div>
      <h2 id="dialogue-heading" className="text-3xl sm:text-5xl my-2 font-serif">Think Together.</h2>
      <div className="flex flex-col gap-4 sm:flex-row justify-between items-start sm:items-center my-4">
        <p className="text-sm leading-6 font-normal text-charcoal pr-2 font-sans w-full sm:w-3/5">
          The Testament asks to be examined, and examination is sharper in
          company. Read a chapter slowly with others; question the words,
          question the writer, and where necessary, question yourself.
        </p>

        <p className="text-[10px] border rounded-md border-bronze-soft px-2 py-1 font-medium text-charcoal flex justify-center items-center pr-2 font-mono">
          <span className="text-forest mr-2">
            <GoDotFill aria-hidden="true" />
          </span>
          Now reading together: Freedom 10
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 py-8">
        {dialogueCards.map((dia) => (
          <article
            className="bg-white/60 min-w-0 flex flex-col border p-6"
            id={dia.tag}
            aria-labelledby={`${dia.tag}-heading`}
            key={dia.id}
          >
            <div className="gap-2 justify-between items-start font-mono text-[10px] font-semibold tracking-wider flex flex-wrap uppercase">
              <p className="text-bronze-ink">{dia.type}</p>
              <p className="text-forest">{dia.meta}</p>
            </div>

            <h3 id={`${dia.tag}-heading`} className="text-xl font-medium tracking-wide pt-8 font-serif">
              {dia.title}
            </h3>
            <div className="flex-1 space-y-3 pt-2 pb-8">
              {dia.body && <p className="text-base leading-6 text-muted font-serif">{dia.body}</p>}
              {dia.verse && (
                <blockquote className="text-base leading-6 italic text-charcoal font-serif">
                  {dia.verse}
                </blockquote>
              )}
              {dia.verseRef && <p className="text-xs text-muted font-mono">{dia.verseRef}</p>}
              {dia.bodyAfter && <p className="text-base leading-6 text-charcoal font-serif">{dia.bodyAfter}</p>}
            </div>
            <Link
              to={dia.href}
              className={`inline-flex min-h-11 justify-center items-center px-4 py-2 border border-forest rounded-md text-sm text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none ${
                dia.ctaStyle === "primary"
                  ? "bg-forest text-white hover:bg-forest-deep"
                  : "bg-transparent text-forest hover:bg-parchment"
              }`}
            >
              {dia.cta}
            </Link>
          </article>
        ))}
      </div>
    </PageContainer>
  );
};

export default Dialogue;
