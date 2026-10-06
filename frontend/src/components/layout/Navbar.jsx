import Logo from "../branding/Logo";
import Button from "../ui/Button";
import { PiMagnifyingGlass } from "react-icons/pi";
import { MdArrowForwardIos, MdMenu } from "react-icons/md";

const navigationItems = [
  { label: "The Testament", href: "/#books" },
  { label: "Questions", href: "/#questions" },
  { label: "Path", href: "/#paths" },
  { label: "Community", href: "/#community" },
  { label: "About", href: "/#about" },
];

const linkStyles =
  "inline-flex min-h-11 items-center rounded-sm px-2 py-2 text-xs font-semibold uppercase tracking-widest text-forest underline-offset-8 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest";

const enterStyles =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-soft border border-forest px-4 py-2 text-xs font-semibold uppercase text-forest transition-colors hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none";

const closeMenu = (event) => {
  event.currentTarget.closest("details").open = false;
};

const Navbar = () => {
  return (
    <div className="fixed inset-x-0 top-0 z-10">

    <header className="relative z-20 border-b border-border  bg-ivory">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-30 focus:rounded-soft focus:bg-forest focus:px-4 focus:py-3 focus:text-white">
        Skip to main content
      </a>
      <nav aria-label="Main navigation" className="mx-auto flex min-h-16 max-w-content items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <a href="/" aria-label="The Human Testament home" className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2">
          <Logo type="horizontal" alt="The Human Testament" width={150} imageClassName="h-auto max-w-full" />
        </a>

        <ul className="hidden items-center gap-2 font-serif xl:flex">
          {navigationItems.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={linkStyles}>{item.label}</a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 xl:flex">
          <Button variant="icon" size="icon" className="h-11 w-11" aria-label="Search (coming soon)" title="Search is coming soon">
            <PiMagnifyingGlass size={24} aria-hidden="true" />
          </Button>
          <span className="mx-2 h-6 border-l border-forest" aria-hidden="true" />
          <Button className="h-11 font-serif uppercase text-xs" variant="ghost"  title="Sign in is coming soon">
            Sign In
          </Button>
          <a href="/#books" className={enterStyles}>
            Enter the Testament
            <MdArrowForwardIos size={16} aria-hidden="true" />
          </a>
        </div>

        <details
          className="xl:hidden"
          onKeyDown={(event) => {
            if (event.key === "Escape" && event.currentTarget.open) {
              event.preventDefault();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary").focus();
            }
          }}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm px-3 text-sm text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest [&::-webkit-details-marker]:hidden">
            <MdMenu size={22} aria-hidden="true" />
            Menu
          </summary>
          <div className="absolute left-0 right-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-border bg-ivory px-4 py-4 sm:px-6 lg:px-8">
            <ul className="space-y-1 font-serif">
              {navigationItems.map((item) => (
                <li key={item.href}>
                  <a href={item.href} onClick={closeMenu} className={`${linkStyles} w-full`}>{item.label}</a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button variant="ghost" className="h-11" disabled title="Search is coming soon" leftIcon={<PiMagnifyingGlass aria-hidden="true" />}>
                Search
              </Button>
              <Button variant="ghost" className="h-11" disabled title="Sign in is coming soon">Sign In</Button>
              <a href="/#books" onClick={closeMenu} className={enterStyles}>
                Enter the Testament
                <MdArrowForwardIos size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </details>
      </nav>
    </header>
</div>
  );
};

export default Navbar;
