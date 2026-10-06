import { useId, useState } from "react";
import { GoGear, GoPencil } from "react-icons/go";
import { MdOutlineEditNote } from "react-icons/md";
import PageContainer from "../layout/PageContainer";
import Button from "../ui/Button";
import { readerSection } from "../../data/readerSection";

const featureIcons = [GoGear, MdOutlineEditNote, GoPencil];

const Sanctuary = () => {
  const { preview } = readerSection;
  const [selectedReference, setSelectedReference] = useState(
    preview.defaultVerse,
  );
  const previewId = useId();
  const selectedVerse = preview.verses.find(
    (verse) => verse.ref === selectedReference,
  );

  return (
    <PageContainer
      as="section"
      id="sanctuary"
      aria-labelledby={`${previewId}-heading`}
      className="my-8 grid grid-cols-1 items-start gap-10 py-12 sm:py-16 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:gap-12"
    >
      <div className="min-w-0">
        <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-bronze-ink">
          {readerSection.eyebrow}
        </p>
        <h2
          id={`${previewId}-heading`}
          className="font-serif text-3xl leading-tight text-charcoal sm:text-5xl"
        >
          {readerSection.headline}
        </h2>
        <p className="mt-5 font-sans text-base leading-relaxed text-muted sm:text-lg">
          {readerSection.body}
        </p>

        <ul className="mt-7 space-y-3">
          {readerSection.features.map(({ title, text }, index) => {
            const Icon = featureIcons[index];

            return (
              <li
                key={title}
                className="flex items-start gap-3 rounded-soft border border-border bg-ivory/50 p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-soft border border-bronze/20 bg-bronze-soft/10 text-bronze-ink">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <p className="min-w-0 text-sm leading-6 text-muted">
                  <strong className="block font-semibold text-charcoal">
                    {title}
                  </strong>
                  {text}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-7">
          <Button
            className="h-auto min-h-12 w-full px-6 py-3 text-xs sm:w-auto"
            variant="primary"
            rightIcon={null}
          >
            {readerSection.cta}
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-labelledby={`${previewId}-chapter`}
        className="min-w-0 overflow-hidden rounded-lg border border-border bg-bronze-soft/10"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <h3
            id={`${previewId}-chapter`}
            className="font-mono text-xs font-semibold uppercase leading-5 tracking-wider text-forest"
          >
            {preview.book} / {preview.chapter}
          </h3>
          <span className="rounded-sm border border-bronze/20 bg-ivory/70 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-bronze-ink">
            Reader preview
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ol
            aria-label="Freedom chapter 10 verses"
            className="min-w-0 space-y-2 p-3 sm:p-4"
          >
            {preview.verses.map((verse) => {
              const isSelected = verse.ref === selectedReference;

              return (
                <li key={verse.ref}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-controls={`${previewId}-notes`}
                    onClick={() => setSelectedReference(verse.ref)}
                    className={`grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 rounded-soft border-l-2 px-3 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 motion-reduce:transition-none sm:gap-4 ${
                      isSelected
                        ? "border-bronze bg-bronze-soft/20"
                        : "border-transparent hover:bg-ivory/80"
                    }`}
                  >
                    <span className="whitespace-nowrap font-mono text-xs text-bronze-ink">
                      <span className="sr-only">Freedom </span>
                      {verse.ref}
                    </span>
                    <span className="min-w-0 font-serif text-lg leading-relaxed text-charcoal sm:text-xl">
                      {verse.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <aside
            id={`${previewId}-notes`}
            aria-labelledby={`${previewId}-note-heading`}
            className="min-w-0 border-t border-border bg-ivory/50 p-5 sm:border-l sm:border-t-0"
          >
            <div aria-live="polite" aria-atomic="true">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-bronze-ink">
                Freedom {selectedVerse.ref}
              </p>
              <h4
                id={`${previewId}-note-heading`}
                className="font-mono text-xs font-semibold leading-5 text-muted"
              >
                {selectedVerse.note
                  ? `Note ${selectedVerse.note.number} · ${selectedVerse.note.type}`
                  : "Margin note"}
              </h4>
              {selectedVerse.note ? (
                <>
                  <p className="mt-3 font-serif text-lg leading-relaxed text-charcoal">
                    {selectedVerse.note.text}
                  </p>
                  {selectedVerse.note.seeAlso && (
                    <div className="mt-6 border-t border-border pt-4">
                      <p className="font-mono text-[10px] uppercase leading-5 tracking-wide text-muted">
                        SEE ALSO · {selectedVerse.note.seeAlso.ref}
                      </p>
                      <blockquote className="mt-2 font-serif text-lg leading-relaxed text-charcoal">
                        {selectedVerse.note.seeAlso.text}
                      </blockquote>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-3 font-serif text-lg leading-relaxed text-muted">
                  {preview.emptyNote}
                </p>
              )}
            </div>
          </aside>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-4 py-4 text-xs leading-5 text-muted sm:px-6">
          <p className="font-medium text-forest">{preview.footerLeft}</p>
          <p>{preview.footerRight}</p>
        </div>
      </div>
    </PageContainer>
  );
};

export default Sanctuary;
