import PageContainer from "../layout/PageContainer";
import BookCard from "./BookCard";
import { GoDash } from "react-icons/go";

const BookCollection = () => {
  return (
    <PageContainer as="section" id="books" tabIndex={-1} aria-labelledby="books-heading" className="bg-ivory border pb-12 scroll-mt-6">
      <div className="flex items-center mt-12 font-mono space-x-1 tracking-widest uppercase text-xs font-semibold text-bronze-ink">
        <GoDash aria-hidden="true" />
        <p>The ten books</p>
      </div>
      <h2 id="books-heading" className="text-3xl sm:text-5xl my-2 font-serif">The Complete Canon</h2>
      <div className="flex flex-col gap-4 sm:flex-row justify-between items-start sm:items-center my-4">
        <p className="text-sm leading-6 text-muted w-full sm:w-2/3">
          Ten books, one sustained examination: of the life we inherit, the
          customs we preserve, the beliefs we defend, and the meanings we give
          to existence.
        </p>
        <p className="text-xs text-muted items-start textshade ">
         231 CHAPTERS · 3,906 VERSES
        </p>
      </div>
        <hr className="w-full border-t border-muted/30" />
      <div className="mt-12">
        <BookCard />
      </div>
    </PageContainer>
  );
};

export default BookCollection;
