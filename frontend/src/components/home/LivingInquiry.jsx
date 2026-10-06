import PageContainer from "../layout/PageContainer";
import { GoDash } from "react-icons/go";
import { questions } from "../../data/questions";
import { FaArrowRight } from "react-icons/fa";

const LivingInquiry = () => {
  return (
    <PageContainer as="section" id="questions" tabIndex={-1} aria-labelledby="questions-heading" className="bg-white/70 py-10 scroll-mt-6">
      <div className="flex items-center pt-8 space-x-1 tracking-widest uppercase text-xs font-semibold text-bronze-ink">
        <GoDash aria-hidden="true" />
        <p>Living Inquiry</p>
      </div>
      <h2 id="questions-heading" className="text-3xl sm:text-5xl my-2 font-serif">Questions worth living with.</h2>
      <div className="flex flex-wrap gap-2 justify-start items-center my-4">
        <blockquote className="text-base font-medium text-charcoal italic pr-2 font-serif">
          “Every meaningful discovery required someone willing to ask why.”
        </blockquote>
        <p className="text-xs text-muted items-start textshade font-mono ">
          FREEDOM 28:7
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8 mt-8">
        {questions.map((q) => (
          <article
            key={q.id}
            aria-labelledby={`question-${q.id}-heading`}
            className="min-w-0 p-4 border rounded bg-bronze-soft/10 flex gap-4 flex-col items-start"
          >
            <p className="text-bronze-ink uppercase text-[10px] px-2 py-1 tracking-wider font-semibold bg-bronze-soft/40">
              {q.tag}
            </p>
            <h3 id={`question-${q.id}-heading`} className="font-bold font-serif text-2xl">{q.question}</h3>
            <p className="text-sm text-muted leading-6">{q.premise}</p>
            <p className="text-[10px] font-semibold font-mono tracking-wider text-bronze-ink">
              {q.ref}
            </p>
            <button type="button" disabled title="Question pages are coming soon" className="mt-auto inline-flex min-h-11 items-center gap-2 text-left text-xs text-muted disabled:cursor-not-allowed">
              {q.Link}
              <FaArrowRight className="shrink-0" aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
      <a
        href="#book-1"
        className="text-forest bg-bronze-soft/20 my-8 p-4 text-sm text-center justify-center items-center flex w-full sm:w-fit mx-auto rounded-sm hover:bg-bronze-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2"
      >
        BEGIN WITH THE BOOK OF INQUIRY →
      </a>
    </PageContainer>
  );
};

export default LivingInquiry;
