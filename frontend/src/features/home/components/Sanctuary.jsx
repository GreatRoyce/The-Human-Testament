import { useId } from "react";
import { GoGear, GoPencil } from "react-icons/go";
import { MdOutlineEditNote } from "react-icons/md";
import PageContainer from "../../../components/layout/PageContainer";
import Button from "../../../components/ui/Button";
import { readerCopy as readerSection } from "../content/readerCopy.js";
import ReaderPreview from "../../reader/components/ReaderPreview.jsx";
import { useNavigate } from "react-router-dom";

const featureIcons = [GoGear, MdOutlineEditNote, GoPencil];

const Sanctuary = () => {
  const previewId = useId();
  const navigate = useNavigate();

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
            onClick={() => navigate('/testament/freedom/10/14')}
          >
            {readerSection.cta}
          </Button>
        </div>
      </div>

      <ReaderPreview labels={readerSection.preview} />
    </PageContainer>
  );
};

export default Sanctuary;
