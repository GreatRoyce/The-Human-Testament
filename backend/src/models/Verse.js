const mongoose = require("mongoose");
const {
  exactString,
  editionFields,
  options,
  positiveInteger,
} = require("./contentFields");
const schema = new mongoose.Schema(
  {
    ...editionFields,
    canonicalId: exactString({ required: true }),
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
    },
    bookSlug: exactString({ required: true }),
    chapterNumber: positiveInteger,
    number: positiveInteger,
    status: {
      type: String,
      enum: ["authored", "missing_source_text"],
      default: "authored",
    },
    text: exactString({
      required() {
        return this.status === "authored";
      },
      validate: {
        validator(value) {
          return (
            value === undefined ||
            (value.trim().length > 0 && !/^\s*\[\[/m.test(value))
          );
        },
        message:
          "Authored text must be nonempty and must not contain editorial markers.",
      },
    }),
    unresolved: mongoose.Schema.Types.Mixed,
  },
  options,
);
schema.pre("validate", function () {
  if (
    this.canonicalId !== `${this.bookSlug}:${this.chapterNumber}:${this.number}`
  )
    this.invalidate(
      "canonicalId",
      "Canonical identity must match its address.",
    );
  if (this.status === "missing_source_text" && this.text !== undefined)
    this.invalidate(
      "text",
      "Unresolved references must not contain verse text.",
    );
});
schema.index({ editionId: 1, canonicalId: 1 }, { unique: true });
schema.index(
  { editionId: 1, book: 1, chapter: 1, number: 1 },
  { unique: true },
);
module.exports = mongoose.model("Verse", schema);
