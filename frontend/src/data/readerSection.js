export const readerSection = {
  eyebrow: "THE DIGITAL SANCTUARY",
  headline: "A Reader Built for Contemplation",
  body: "Digital reading should not imitate the restless web. The reading room is built for slowness: generous margins, no popups, and the book's own notes and cross-references set beside the verse, where a printed page would keep them.",
  features: [
    {
      title: "Book, Chapter, Verse.",
      text: "Every verse has a fixed address, such as Freedom 10:14, for exact reference and citation.",
    },
    {
      title: "Notes in the margin.",
      text: "The book's 1,470 footnotes and its Cross-Reference Index open beside the verse, never over it.",
    },
    {
      title: "Private margins.",
      text: "Keep your own notes and questions beside any verse, seen by no one but you.",
    },
  ],
  cta: "LAUNCH READING ROOM →",
  preview: {
    book: "BOOK II · FREEDOM",
    chapter: "CHAPTER 10",
    defaultVerse: "10:14",
    verses: [
      {
        ref: "10:11",
        text: "Every life is shaped by decisions both large and small. The future often enters quietly through ordinary choices.",
        note: null,
      },
      {
        ref: "10:12",
        text: "Freedom is not the absence of consequences. It is the privilege of selecting them.",
        note: {
          number: 261,
          type: "Context",
          text: "Redefines freedom as the ability to choose among consequences, not the absence of consequence entirely.",
          seeAlso: null,
        },
      },
      {
        ref: "10:13",
        text: "The person who fears choosing becomes a servant of circumstance.",
        note: null,
      },
      {
        ref: "10:14",
        text: "Responsibility is the shadow cast by freedom.",
        note: {
          number: 262,
          type: "Context",
          text: "Reinforces the earlier pairing of freedom with responsibility rather than treating them as opposites.",
          seeAlso: {
            ref: "Inquiry 16:9",
            text: "Liberation is not the absence of responsibility but the presence of choice.",
          },
        },
      },
    ],
    emptyNote: "This verse carries no note. Its meaning rests in the chapter around it.",
    footerLeft: "Select a verse to open its note",
    footerRight: "Notes and cross-references from the printed text",
  },
};
