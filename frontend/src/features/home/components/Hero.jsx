import { GoDotFill } from "react-icons/go";
import { manuscriptCounts, manuscriptSource, manuscriptVerse } from '../../../services/manuscriptContent.js';
import { Link } from 'react-router-dom';

const HeroFooter = [
  `${manuscriptCounts.books} books`,
  `${manuscriptCounts.chapters} chapters`,
  `${manuscriptCounts.references.toLocaleString('en-US')} verse references`,
  `${manuscriptCounts.notes.toLocaleString('en-US')} footnotes`,
  `${manuscriptSource.pages} pages`,
];

const Hero = () => {
  return (
    <section aria-labelledby="hero-heading" className="mx-auto max-w-screen-lg min-h-[calc(100svh-4rem)] px-4 py-12 sm:px-6 sm:py-24 items-center justify-center flex flex-col gap-8">
      <div className="font-mono flex flex-wrap uppercase font-medium items-center justify-center gap-2 text-xs text-muted text-center tracking-widest">
        <GoDotFill aria-hidden="true" />
        <span>The human testament</span>
        <GoDotFill size={6} aria-hidden="true" />
        <span>A living philosophical corpus</span>
        <GoDotFill aria-hidden="true" />
      </div>
      <h1 id="hero-heading" className="text-4xl sm:text-6xl lg:text-7xl font-serif font-bold text-center text-forest">
        What does it mean to be{" "}
        <span className="font-serif font-bold text-center text-bronze">
          human?
        </span>
      </h1>

      <p className="text-lg sm:text-xl max-w-3xl font-sans font-normal text-center text-muted">
        A testament of enquiry into freedom, power, society, identity,
        relationships, humanity, existence, belief and purpose.
      </p>

      <div className="flex w-full flex-col sm:w-auto sm:flex-row gap-4 sm:pb-6">
        <Link
          to="/testament"
          className="inline-flex min-h-18 items-center justify-center rounded-soft bg-forest px-8 py-4 text-center text-sm font-semibold uppercase text-white transition-colors hover:bg-forest-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none sm:px-12"
        >
          Start reading
        </Link>
        <Link to="/register" className="inline-flex min-h-18 items-center justify-center rounded-soft border border-forest px-8 py-4 text-center text-sm font-semibold uppercase text-forest transition-colors hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none sm:px-12">
          Create an account
        </Link>
      </div>
      <a href="#questions" className="text-sm text-forest underline underline-offset-4">Explore the questions</a>
      <blockquote className="max-w-2xl text-center text-charcoal text-base italic font-serif">
        “{manuscriptVerse('freedom', 18, 15)}” - Freedom 18:15
      </blockquote>
      <hr className="w-5/6 border-b border-muted/30 " />
      <ul aria-label="The Testament in numbers" className="w-full flex flex-wrap gap-x-8 gap-y-3 uppercase mx-auto justify-center items-center">
        {HeroFooter.map((item) => (
          <li key={item} className="text-muted text-xs font-mono font-medium">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default Hero;
