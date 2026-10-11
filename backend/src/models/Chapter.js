
const mongoose = require("mongoose");

const chapterSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    number: {
      type: Number,
      required: true,
      min: 1,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

chapterSchema.index(
  { book: 1, number: 1 },
  { unique: true }
);

module.exports = mongoose.model("Chapter", chapterSchema);
