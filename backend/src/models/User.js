const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Practical ASCII mailbox syntax; email ownership is verified separately later.
// Do not remove dots or plus tags: those rules differ between mail providers.
function validEmail(value) {
  if (typeof value !== "string" || value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2 || parts[0].length > 64) return false;
  const local =
    /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
  const labels = parts[1].split(".");
  return (
    local.test(parts[0]) &&
    labels.length >= 2 &&
    labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
    ) &&
    /[a-z]/i.test(labels.at(-1))
  );
}

function validPasswordHash(value) {
  // A hash is supplied by a trusted caller using bcryptjs.hash(), never by
  // treating user-supplied plaintext as passwordHash or hashing it implicitly.
  if (
    typeof value !== "string" ||
    value.length !== 60 ||
    !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)
  )
    return false;
  const rounds = bcrypt.getRounds(value);
  return rounds >= 10 && rounds <= 31;
}

function hideCredentials(document, value) {
  delete value.passwordHash;
  return value;
}

const emailCollation = { locale: "en", strength: 2 };
const schema = new mongoose.Schema(
  {
    email: {
      type: String,
      cast: false,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: {
        validator: validEmail,
        message: "A valid email address is required.",
      },
    },
    passwordHash: {
      type: String,
      cast: false,
      required: true,
      select: false,
      validate: {
        validator: validPasswordHash,
        message:
          "A bcrypt password hash with a cost of at least 10 is required.",
      },
    },
    displayName: {
      type: String,
      cast: false,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
      validate: {
        validator: (value) => !/[\u0000-\u001f\u007f]/.test(value),
        message: "Display names must not contain control characters.",
      },
    },
    // No privileged role is assignable yet, even by mass-assigning account input.
    // Extend this enum only alongside a separately authorized provisioning path.
    role: {
      type: String,
      cast: false,
      enum: ["user"],
      default: "user",
      required: true,
    },
    emailVerified: { type: Boolean, default: false, required: true },
    isActive: { type: Boolean, default: true, required: true },
    passwordChangedAt: { type: Date },
  },
  {
    timestamps: true,
    autoCreate: false,
    autoIndex: false,
    strict: "throw",
    collation: emailCollation,
    toJSON: { transform: hideCredentials },
    toObject: { transform: hideCredentials },
  },
);

// `unique` is a database constraint, not a validation rule. Collation also
// rejects case variants written by other database clients after index creation.
schema.index(
  { email: 1 },
  { unique: true, name: "user_email_unique", collation: emailCollation },
);

module.exports = mongoose.model("User", schema);
