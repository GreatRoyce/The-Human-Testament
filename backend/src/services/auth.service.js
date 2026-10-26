const bcrypt = require("bcryptjs");
const { randomBytes } = require("node:crypto");
const User = require("../models/User");
const { createSession } = require("./session.service");
const {
  assertPassword,
  hashPassword,
  verifyPassword,
} = require("../utils/passwords");
const { bodyFields, normalizeEmail } = require("../utils/accountInput");
const verification = require("./emailVerification.service");
const fail = (status, message) => Object.assign(new Error(message), { status });
const safeUser = (user) => ({
  id: String(user._id),
  email: user.email,
  displayName: user.displayName,
  role: user.role,
  emailVerified: user.emailVerified,
  isActive: user.isActive,
});

async function register(body) {
  bodyFields(body, ["email", "password", "displayName"]);
  const email = await normalizeEmail(body.email);
  assertPassword(body.password);
  const candidate = new User({ email, displayName: body.displayName });
  try {
    await candidate.validate(["displayName"]);
  } catch {
    throw fail(
      400,
      "Display name must contain 1 to 80 characters without control characters.",
    );
  }
  const passwordHash = await hashPassword(body.password);
  try {
    const user = await User.create({
      email,
      displayName: candidate.displayName,
      passwordHash,
    });
    // Delivery/configuration failures leave a valid unverified account; resend
    // can retry later. Registration never grants ownership verification.
    await verification.requestVerification({ _id: user._id });
    return safeUser(user);
  } catch (error) {
    if (error.code === 11000)
      throw fail(409, "An account with this email already exists.");
    if (error.name === "ValidationError")
      throw fail(400, "Invalid account input.");
    throw error;
  }
}
// Lazily generated with the same work factor as real hashes. Unknown accounts
// still perform a comparison; neither this hash nor credentials are logged.
let dummyHash;
async function login(body, config) {
  bodyFields(body, ["email", "password"]);
  let email;
  try {
    email = await normalizeEmail(body.email);
  } catch {
    throw fail(401, "Invalid email or password.");
  }
  if (
    !body.password ||
    bcrypt.truncates(body.password) ||
    /[\u0000-\u001f\u007f]/.test(body.password)
  )
    throw fail(401, "Invalid email or password.");
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!dummyHash)
    dummyHash = bcrypt.hash(randomBytes(32).toString("base64url"), 12);
  const matched = await verifyPassword(
    body.password,
    user?.passwordHash ?? (await dummyHash),
  );
  if (!matched || !user?.isActive)
    throw fail(401, "Invalid email or password.");
  return { user: safeUser(user), ...(await createSession(user, config)) };
}
module.exports = { register, login, safeUser, bodyFields, normalizeEmail };
