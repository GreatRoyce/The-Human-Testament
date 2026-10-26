const mongoose = require("mongoose");
const { exactString, editionFields, options } = require("./contentFields");
const schema = new mongoose.Schema(
  {
    ...editionFields,
    id: exactString({ required: true }),
    kind: {
      type: String,
      enum: ["front_matter", "back_matter", "chapter_supporting_material"],
      required: true,
    },
    marker: exactString(),
    heading: exactString(),
    bookSlug: exactString(),
    chapter: Number,
    sourceLine: Number,
    lines: { type: [mongoose.Schema.Types.Mixed], required: true },
  },
  { ...options, strict: false },
);
schema.index({ editionId: 1, id: 1 }, { unique: true });
module.exports = mongoose.model("ContentSection", schema);
