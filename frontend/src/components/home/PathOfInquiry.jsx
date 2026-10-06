import PageContainer from "../layout/PageContainer";
import { GoDash } from "react-icons/go";
import paths from "../../data/paths";
import { MdArrowRight } from "react-icons/md";

const PathOfInquiry = () => {
  return (
    <PageContainer as="section" id="paths" tabIndex={-1} aria-labelledby="paths-heading" className="bg-bronze-soft/10 py-8 my-12 scroll-mt-6">
      <div className="flex items-center pt-4 space-x-1 tracking-widest font-mono uppercase text-xs font-semibold text-bronze-ink">
        <GoDash aria-hidden="true" />
        <p>EXPLORE BY IDEA</p>
      </div>
      <h2 id="paths-heading" className="text-3xl sm:text-5xl my-2 font-serif">Paths of Inquiry</h2>
      <div className="flex justify-start items-center my-4">
        <p className="text-sm leading-6 font-normal text-charcoal pr-2 font-sans">
          Follow a single idea as it returns across the ten books, instead of
          reading from the first page to the last.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-2 gap-6 lg:gap-8">
        {paths.map((path) => (
          <article
            aria-labelledby={`path-${path.id}-heading`}
            className="min-w-0 bg-white/60 flex flex-col gap-3 p-6"
            key={path.id}
          >
            <div aria-hidden="true" className="text-2xl p-2 rounded-md bg-bronze-soft/30 text-bronze border justify-start items-start w-fit flex">
              {path.icon}
            </div>
            <h3 id={`path-${path.id}-heading`} className="text-3xl font-medium font-serif">{path.path}</h3>
            <blockquote className="text-base font-medium tracking-wide italic font-serif">
              {path.verse}
            </blockquote>
            <p className="text-xs leading-5 text-muted">
              {path.books.map((book) => book.name).join(" • ")}
            </p>
            <hr className="mt-auto border-bronze/30 border-t" />
            <button type="button" disabled title="Path reading is coming soon" className="inline-flex min-h-11 items-center gap-1 text-left text-xs text-muted font-mono uppercase disabled:cursor-not-allowed">
              <span>Follow this path • {path.books.length} books</span>
              <MdArrowRight aria-hidden="true" className="shrink-0" />
            </button>
          </article>
        ))}
      </div>
    </PageContainer>
  );
};

export default PathOfInquiry;
