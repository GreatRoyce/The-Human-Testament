const mongoose = require('mongoose');
const options = { timestamps: true, strict: 'throw', autoIndex: false, autoCreate: false };
const ref = (model, immutable = true) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true, immutable });
const text = (max, required = true) => ({ type: String, cast: false, required, maxlength: max,
  validate: { validator: value => value === undefined || (!required && value === '') || /\S/u.test(value), message: 'Text must not be blank.' } });
module.exports = { options, ref, text };
