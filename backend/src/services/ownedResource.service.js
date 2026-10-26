const { authenticatedUser } = require('../utils/authorization');
const notFound = () => Object.assign(new Error('Resource not found.'), { status: 404 });
const invalidInput = () => Object.assign(new Error('Invalid resource input.'), { status: 400 });
const reserved = new Set(['owner', 'ownerId', 'user', 'userId', '_id', 'id', '__v', 'role',
  'emailVerified', 'isActive', 'passwordHash', 'passwordChangedAt', 'createdAt', 'updatedAt']);
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function noQuery(query) {
  // Individual-resource operations have no query options. Never turn arbitrary
  // query parameters into filters, update operators, projections or ownership.
  if (!plainObject(query) || Object.keys(query).length) throw invalidInput();
}
async function validatedWrite(operation) {
  try { return await operation(); }
  catch (error) {
    if (['ValidationError', 'CastError', 'StrictModeError'].includes(error.name)) throw invalidInput();
    throw error;
  }
}
function ownerFilter(auth, id, query, ownerField) {
  const user = authenticatedUser(auth);
  noQuery(query);
  if (typeof id !== 'string' || id.length !== 24 || !/^[a-fA-F0-9]{24}$/.test(id)) throw notFound();
  return { _id: id, [ownerField]: user._id };
}
function createOwnedResourceAccess(Model, { writableFields = [], createFields = writableFields, ownerField = 'owner' } = {}) {
  const owner = ['owner', 'user'].includes(ownerField) && Model?.schema?.path(ownerField);
  if (!owner || owner.instance !== 'ObjectId' || owner.options.ref !== 'User' ||
      owner.options.required !== true || owner.options.immutable !== true)
    throw new Error('Private resources require an immutable User owner.');
  if (!Array.isArray(writableFields) || writableFields.some(field => typeof field !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field) || reserved.has(field) || !Model.schema.path(field) ||
      Model.schema.path(field).options.immutable)) throw new Error('Invalid private-resource write allowlist.');
  if (!Array.isArray(createFields) || createFields.some(field => typeof field !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field) || reserved.has(field) || !Model.schema.path(field)))
    throw new Error('Invalid private-resource create allowlist.');
  const allowed = new Set(writableFields);
  function input(body, fields = allowed) {
    if (!plainObject(body) || Object.keys(body).some(key => !fields.has(key))) throw invalidInput();
    return Object.fromEntries(Object.entries(body));
  }
  return Object.freeze({
    async create(auth, body, query = {}) {
      const user = authenticatedUser(auth); noQuery(query);
      const values = { ...input(body, new Set(createFields)), [ownerField]: user._id };
      return validatedWrite(() => Model.create(values));
    },
    async findById(auth, id, query = {}) {
      const record = await Model.findOne(ownerFilter(auth, id, query, ownerField));
      if (!record) throw notFound(); return record;
    },
    async updateById(auth, id, body, query = {}) {
      const filter = ownerFilter(auth, id, query, ownerField), changes = input(body);
      if (!Object.keys(changes).length) throw invalidInput();
      const record = await validatedWrite(() => Model.findOneAndUpdate(filter, { $set: changes }, { returnDocument: 'after', runValidators: true }));
      if (!record) throw notFound(); return record;
    },
    async deleteById(auth, id, query = {}) {
      const record = await Model.findOneAndDelete(ownerFilter(auth, id, query, ownerField));
      if (!record) throw notFound(); return record;
    },
  });
}
module.exports = { createOwnedResourceAccess };
