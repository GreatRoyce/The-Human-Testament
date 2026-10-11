import PageContainer from "../layout/PageContainer";
import footer from "../../data/footer";
import { GoDash } from "react-icons/go";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-forest-deep">
      <PageContainer className="grid grid-cols-1 gap-10 py-12 sm:gap-12">
        <div className="flex flex-col items-center justify-center space-y-2 py-4 text-center">
          <GoDash aria-hidden="true" className="text-bronze-soft leading-tight" size={40} />
          <p className="font-serif text-3xl italic leading-tight text-ivory sm:text-4xl">
            {footer.closingLine}
          </p>
          <p className="font-mono text-[10px] text-bronze-soft">
            {footer.closingLabel}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12">
          <section className="min-w-0">
            <h2 className="font-serif text-2xl text-ivory">{footer.title}</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-ivory/70">
              {footer.description}
            </p>
            <p className="mt-5 font-mono text-xs text-bronze-soft">
              {footer.notify.label}
            </p>
            <div className="mt-2 flex max-w-sm text-xs">
              <label className="sr-only" htmlFor="footer-notify-email">
                Email address for printed book updates
              </label>
              <input
                aria-describedby="footer-notify-availability"
                autoComplete="email"
                className="min-w-0 flex-1 rounded-l-sm border border-r-0 border-ivory/40 bg-white/5 py-3 pl-3 text-ivory/80 placeholder:text-ivory/50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled
                id="footer-notify-email"
                placeholder={footer.notify.placeholder}
                type="email"
              />
              <button
                className="rounded-r-sm bg-bronze-soft/50 px-4 py-3 font-semibold tracking-widest text-forest-deep/80 disabled:cursor-not-allowed"
                disabled
                type="button"
              >
                {footer.notify.button}
              </button>
            </div>
            <p
              className="mt-2 max-w-sm text-xs leading-5 text-ivory/60"
              id="footer-notify-availability"
            >
              {footer.notify.unavailableMessage}
            </p>
          </section>

          <nav aria-label="Footer navigation" className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {footer.columns.map((column) => (
              <div key={column.heading}>
                <h3 className="pb-2 font-mono text-xs text-bronze-soft">
                  {column.heading}
                </h3>
                <ul className="space-y-1">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        className="inline-flex min-h-8 items-center rounded-sm text-xs leading-5 text-ivory/70 underline-offset-4 hover:text-ivory hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze-soft focus-visible:ring-offset-2 focus-visible:ring-offset-forest-deep"
                        href={link.href}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-ivory/15 pt-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <p className="font-mono text-xs leading-5 text-ivory/70">
            {footer.legal}
          </p>
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2 sm:justify-end">
            {footer.legalLinks.map((link) => (
              <Link
                className="inline-flex min-h-8 items-center rounded-sm font-mono text-xs text-ivory/70 underline-offset-4 hover:text-ivory hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze-soft focus-visible:ring-offset-2 focus-visible:ring-offset-forest-deep"
                key={link.href}
                to={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </PageContainer>
    </footer>
  );
};

export default Footer;
