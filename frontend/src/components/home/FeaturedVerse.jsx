import { useId, useState } from "react";
import { GoDotFill } from "react-icons/go";
import PageContainer from "../layout/PageContainer";
import { FaArrowRightLong } from "react-icons/fa6";

const buttonStyle =
  "inline-flex min-h-11 items-center justify-center gap-3 rounded-sm border border-forest/20 px-4 py-3 text-[11px] font-semibold tracking-wide transition-colors enabled:hover:border-forest enabled:hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none";

const labelStyle =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-bronze-ink";

const tabs = [
  { id: "context", label: "Note: Context" },
  { id: "cross-reference", label: "Cross-Reference (1)" },
  { id: "glossary", label: "Glossary" },
];

const FeaturedVerse = () => {
  const [activeTab, setActiveTab] = useState("context");
  const tabId = useId();

  const handleTabKeyDown = (event, index) => {
    let nextIndex;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);
    const tabButtons =
      event.currentTarget.parentElement.querySelectorAll('[role="tab"]');
    tabButtons[nextIndex].focus();
  };

  return (
    <PageContainer
      as="section"
      id="verse-apparatus"
      tabIndex={-1}
      aria-labelledby={`${tabId}-heading`}
      className="bg-ivory py-12 text-forest-deep sm:py-16 lg:py-20 scroll-mt-6"
    >
      <header className="mx-auto mb-8 max-w-2xl font-mono text-center sm:mb-12">
        <p className={`${labelStyle} mb-4`}>THE APPARATUS</p>
        <h2
          id={`${tabId}-heading`}
          className="font-serif text-4xl leading-tight sm:text-5xl"
        >
          The Anatomy of a Verse
        </h2>
        <p className="mx-auto mt-4 max-w-xl font-serif text-lg leading-relaxed text-muted sm:text-xl">
          No verse stands alone. Each is set with notes that clarify it,
          cross-references that link it to verses in other books, and a glossary
          that fixes its key terms.
        </p>
      </header>

      <div className="mx-auto max-w-5xl overflow-hidden rounded-soft border border-bronze/25 bg-white/60">
        {/* Header bar: FREEDOM · CHAPTER 9 · VERSE 7 (left), and FREEDOM 9:7 · PAGE 83 (right) */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-bronze/20 bg-parchment/60 px-5 py-4 text-[10px] font-semibold tracking-wider sm:px-8">
          <div className="flex items-center gap-2 text-forest">
            <GoDotFill className="shrink-0 text-bronze" aria-hidden="true" />
            <p>FREEDOM · CHAPTER 9 · VERSE 7</p>
          </div>
          <p className="text-muted">FREEDOM 9:7 · PAGE 83</p>
        </div>
        <div className="px-5 py-10 text-center sm:px-12 sm:py-14">
          <p className="mx-auto max-w-lg text-[10px] font-medium uppercase leading-relaxed tracking-[0.15em] text-muted">
            BOOK II · LIBERTY, RESPONSIBILITY, AND THE PRICE OF CHOICE
          </p>
          <blockquote className="mx-auto mt-6 max-w-verse font-serif text-3xl italic leading-normal sm:text-4xl">
            Freedom begins when self-worth no longer depends upon the opinions
            of others.
            <sup
              className="ml-1.5 font-sans text-[10px] font-semibold not-italic text-bronze-ink"
              aria-label="Footnote 257"
            >
              257
            </sup>
          </blockquote>
          <div
            className="mx-auto mt-8 h-px w-12 bg-bronze/60"
            aria-hidden="true"
          />
        </div>
        {/* Note: Context · Cross-Reference (1) · Glossary */}
        <div
          role="tablist"
          aria-label="Verse apparatus"
          className="grid grid-cols-3 gap-1 border-y border-bronze/20 bg-parchment/40 p-2 sm:flex sm:gap-2 sm:px-8 sm:py-3"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`${tabId}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tabId}-panel`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`min-h-11 min-w-0 rounded-sm px-2 py-3 text-[10px] font-semibold leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none sm:px-5 sm:text-xs ${activeTab === tab.id ? "bg-forest text-white" : "text-muted hover:bg-parchment hover:text-forest"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-10 lg:p-10">
          <div
            id={`${tabId}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-${activeTab}`}
            tabIndex={0}
            className="min-w-0 space-y-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze focus-visible:ring-offset-4 sm:min-h-[15rem]"
          >
            {activeTab === "context" && (
              <>
                <h3 className={labelStyle}>FOOTNOTE 257 · CONTEXT</h3>
                <p className="max-w-xl font-serif text-xl leading-relaxed sm:text-2xl">
                  Connects freedom directly to independence from external
                  opinion, a theme echoed earlier.
                </p>
                <p className="max-w-xl text-xs leading-7 text-muted sm:text-sm">
                  Every note is one of four kinds: Definition, Clarification,
                  Context, or Reflection. This tab takes the name of whichever
                  kind the verse carries.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2 text-[10px] font-semibold tracking-wide">
                  <span className="border border-bronze/25 bg-parchment/40 px-3 py-2 text-muted">
                    BOOK II · FREEDOM
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("cross-reference");
                      document
                        .getElementById(`${tabId}-cross-reference`)
                        .focus();
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-sm text-forest underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
                  >
                    SEE ALSO: INQUIRY 14:5{" "}
                    <FaArrowRightLong aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
            {activeTab === "cross-reference" && (
              <>
                <h3 className={labelStyle}>CROSS-REFERENCE · INQUIRY 14:5</h3>
                <p className="border-l-2 border-bronze/40 pl-5 font-serif text-xl leading-relaxed sm:text-2xl">
                  Inquiry 14:5:{" "}
                  <em>"Authenticity is worth more than approval."</em>
                </p>
                <p className="max-w-xl text-xs leading-7 text-muted sm:text-sm">
                  What Freedom states as liberty, Inquiry states first as value;
                  the same truth, approached from two books.
                </p>
              </>
            )}
            {activeTab === "glossary" && (
              <>
                <h3 className={labelStyle}>GLOSSARY</h3>
                <p className="max-w-xl font-serif text-xl leading-relaxed sm:text-2xl">
                  <strong className="mb-3 block font-semibold">
                    Self-Worth:
                  </strong>
                  A sense of value that does not depend on the opinions or
                  presence of witnesses.{" "}
                  <em className="mt-3 block text-base text-muted">(Freedom)</em>
                </p>
              </>
            )}
          </div>

          <aside className="flex flex-col items-start gap-4 border-t border-bronze/20 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className={labelStyle}>THE VERSE IN ITS CHAPTER</p>
            <p className="font-serif text-3xl">Freedom 9</p>
            <p className="-mt-2 text-xs text-muted">Verse 7 · Page 83</p>
            <button
              type="button"
              disabled
              title="Chapter reading is coming soon"
              className={`${buttonStyle} mt-2 w-full bg-forest text-ivory`}
            >
              READ FREEDOM 9 <FaArrowRightLong aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled
              title="Saving verses is coming soon"
              className={`${buttonStyle} w-full text-forest`}
            >
              Save This Verse
            </button>
          </aside>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-bronze/20 bg-parchment/30 px-5 py-5 text-[9px] font-semibold uppercase tracking-wider text-muted sm:gap-x-5 sm:text-[10px]">
          <span>Book</span>
          <FaArrowRightLong className="text-bronze/70" aria-hidden="true" />
          <span>Chapter</span>
          <FaArrowRightLong className="text-bronze/70" aria-hidden="true" />
          <span className="text-forest">Verse</span>
          <FaArrowRightLong className="text-bronze/70" aria-hidden="true" />
          <span>Cross-Reference</span>
          <FaArrowRightLong className="text-bronze/70" aria-hidden="true" />
          <span>glossary</span>
        </div>
      </div>
    </PageContainer>
  );
};

export default FeaturedVerse;
