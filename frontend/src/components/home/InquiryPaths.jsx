import PageContainer from "../layout/PageContainer";
import { GoDash } from "react-icons/go";
import { FaArrowRight } from "react-icons/fa";

const InquiryPaths = () => {
  return (
    <PageContainer as="section" id="about" tabIndex={-1} aria-labelledby="philosophy-heading" className="py-12 sm:py-20 bg-parchment/40 items-start grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 lg:gap-12 scroll-mt-6">
      <div className="flex flex-col space-y-8">
        <div className="flex items-center space-x-1 tracking-widest uppercase text-xs font-mono font-semibold text-bronze-ink">
          <GoDash aria-hidden="true" />
          <h2 id="philosophy-heading">The philosophy</h2>
        </div>
        <p className="text-sm leading-7 text-muted">
          The Human Testament is a work of wisdom in ten books, written in the form of the ancient wisdom literature. It is not a history, nor a revelation, nor a doctrine owed obedience. It is an examination of the life we inherit, the customs we preserve, the beliefs we defend, and the meanings we give to existence. Across 231 chapters and nearly four thousand verses, it moves from Inquiry to Purpose, taking up freedom, power, society, identity, relationships, humanity, existence, and belief along the way. It borrows the old form not because the ancients were wiser, but because their form leaves room for reflection. What it offers is not a set of answers to accept, but a way of seeing to practise.
        </p>
        <p className="text-sm leading-7 text-muted">
        In an age that rewards speed and agreement, the Testament asks for slowness. Its verses are brief so they can be carried in the mind long after the page is closed, and tested against reason, against experience, and against the life you have observed. Nothing here is protected from scrutiny, not even the book itself. Footnotes clarify difficult terms and open further reflection; a cross-reference index links verses that answer one another across the ten books. Read it a verse at a time or a book at a time; either way, the task is the same. What is inherited may be worth keeping, but not merely because it was inherited. What survives, keep. What fails, let go.
        </p>
        <a href="#verse-apparatus" className="inline-flex min-h-11 w-fit items-center gap-3 rounded-sm text-xs uppercase text-forest underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest font-mono font-semibold">
            Learn about the testament
            <FaArrowRight aria-hidden="true" />
        </a>
      </div>

      <div className="flex flex-col space-y-6">
        {/* Additional content for the second column can go here */}

        <div className="flex flex-col space-y-6 border h-fit py-8 px-4 bg-bronze/10 shade rounded-md">
          <blockquote className="text-forest-deep font-serif italic font-semibold text-2xl ">
            "They form no doctrine.
            <br /> They promise no certainty.
            <br /> They ask only that the reader examine."
          </blockquote>
          <hr className="border-bronze w-1/6 border-b-2" />
          <p className="text-bronze-ink uppercase tracking-widest font-mono text-xs">
            The foundational credo
          </p>
        </div>

        <div className="flex flex-col space-y-6 border h-fit py-8 px-4 bg-ivory shade rounded-md">
          <h3 className="text-forest-deep tracking-widest font-semibold text-xs uppercase">
            The open dialectic
          </h3>
          <p className="text-sm leading-7 text-muted">
            Each verse stands alone as a single thought to sit with. Read within
            its chapter and its Book, it becomes part of a sustained examination
            of one part of life, from Inquiry to Purpose. Question the words,
            question the writer, and where necessary, question yourself.
          </p>
        </div>
      </div>
    </PageContainer>
  );
};

export default InquiryPaths;
