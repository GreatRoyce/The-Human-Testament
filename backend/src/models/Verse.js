
const mongoose = require("mongoose");

const verseSchema = new mongoose.Schema(
  {
    canonicalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
      index: true,
    },
    number: {
      type: Number,
      required: true,
      min: 1,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    sourceVersion: {
      type: String,
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

verseSchema.index(
  { chapter: 1, number: 1 },
  { unique: true }
);

module.exports = mongoose.model("Verse", verseSchema);
