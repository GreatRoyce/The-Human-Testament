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
    noteNumber: positiveInteger,
    bookSlug: exactString({ required: true }),
    anchor: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: (value) =>
        value &&
        ["explicit", "inferred"].includes(value.status) &&
        Number.isSafeInteger(value.chapter) &&
        value.chapter > 0 &&
        Number.isSafeInteger(value.verse) &&
        value.verse > 0 &&
        typeof value.bookSlug === "string" &&
        value.sourceMarkerPresent === (value.status === "explicit") &&
        (value.status !== "inferred" || value.reviewRequired === true),
    },
    type: {
      type: String,
      enum: ["Reflection", "Clarification", "Definition", "Context"],
      required: true,
    },
    text: exactString({ required: true }),
    rawText: exactString({ required: true }),
    markerText: exactString({ required: true }),
    inferredAnchor: Boolean,
    reviewRequired: Boolean,
    reviewReasons: [String],
    crossReferenceIds: [String],
  },
  { ...options, strict: false },
);
schema.index({ editionId: 1, noteNumber: 1 }, { unique: true });
schema.index({
  editionId: 1,
  "anchor.bookSlug": 1,
  "anchor.chapter": 1,
  "anchor.verse": 1,
});
module.exports = mongoose.model("Note", schema);
