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
    title: exactString({ required: true }),
    slug: exactString({ required: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ }),
    order: positiveInteger,
    chapterCount: positiveInteger,
    subtitle: exactString({ default: "" }),
    description: exactString({ default: "" }),
  },
  options,
);
schema.index({ editionId: 1, slug: 1 }, { unique: true });
schema.index({ editionId: 1, order: 1 }, { unique: true });
module.exports = mongoose.model("Book", schema);
