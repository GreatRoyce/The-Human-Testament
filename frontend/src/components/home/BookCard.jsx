import books from "../../data/books";
import { Link } from "react-router-dom";

const BookCard = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {books.map((book) => (
        <article
          id={`book-${book.id}`}
          tabIndex={-1}
          aria-labelledby={`book-${book.id}-heading`}
          className="min-w-0 flex flex-col p-4 gap-4 border-border rounded-md border bg-bronze-soft/10 pt-8 scroll-mt-6"
          key={book.id}
        >
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <span className="uppercase text-xs border bg-bronze-soft/20 py-1 px-2 rounded shadow-sm text-bronze-ink font-semibold">
              {book.number}
            </span>
            <span className="text-xs tracking-wide font-normal text-muted">
              {book.subtitle}
            </span>
          </div>

          <h3 id={`book-${book.id}-heading`} className="text-xl font-bold font-serif">Book of {book.title}</h3>
          <p className="text-sm font-normal leading-6 text-muted">
            {book.desc}
          </p>

          <div className="mt-auto pt-4">
            <hr className=" border-t w-full border-bronze-soft/80" />
            <Link
              to={`/books/${book.id}`}
              aria-label={`Explore the Book of ${book.title}`}
              className="flex min-h-11 justify-between items-center gap-2 rounded-sm text-xs text-forest uppercase hover:text-forest-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest font-mono "
            >
              Explore
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
};

export default BookCard;
