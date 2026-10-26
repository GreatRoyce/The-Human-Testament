const mongoose = require('mongoose');
const Article = require('../models/Article');
const Publication = require('../models/ArticlePublication');
const Audit = require('../models/ModerationAction');
const community = require('./community.service');
const { supportsTransactions, transactionOptions } = require('./accountStorage');
const { contentFields, categories, tagPattern, validCover, validReference } = require('../models/articleContent');
const slugs = require('../utils/articleSlug');
const { emitNotification } = require('./notificationEvents.service');
const contentKeys = Object.keys(contentFields);
const statuses = ['draft', 'pending_review', 'published', 'rejected', 'archived'];
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const invalid = () => fail(400, 'Invalid article input.');
const missing = () => fail(404, 'Article not found.');
const objectId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value) ? value : missing();
function fields(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) invalid();
}
function text(value, max, required = false) { if (typeof value !== 'string' || value.length > max || (required && !/\S/u.test(value))) invalid(); return value; }
function content(input, create = false) {
  fields(input, [...contentKeys, ...(create ? [] : ['expectedRevision'])]); const result = {};
  for (const [key, max, required] of [['title', 180, true], ['subtitle', 300], ['body', 100000, true], ['excerpt', 600]]) {
    if (input[key] !== undefined || (create && required)) result[key] = text(input[key], max, required);
  }
  if (result.title) result.title = result.title.trim();
  if (input.coverImage !== undefined) { if (!validCover(input.coverImage)) invalid(); result.coverImage = input.coverImage; }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 8 || input.tags.some(tag => typeof tag !== 'string')) invalid();
    result.tags = input.tags.map(tag => tag.trim().toLowerCase());
    if (result.tags.some(tag => !tagPattern.test(tag) || tag.length > 32) || new Set(result.tags).size !== result.tags.length) invalid();
  }
  if (input.category !== undefined) { if (!['', ...categories].includes(input.category)) invalid(); result.category = input.category; }
  if (input.canonicalReferences !== undefined) {
    if (!Array.isArray(input.canonicalReferences) || input.canonicalReferences.length > 12) invalid();
    const keys = new Set();
    result.canonicalReferences = input.canonicalReferences.map(reference => {
      fields(reference, ['bookId', 'chapterNumber', 'verseId']); if (!validReference(reference)) invalid();
      const key = `${reference.bookId}:${reference.chapterNumber ?? ''}:${reference.verseId ?? ''}`; if (keys.has(key)) invalid(); keys.add(key);
      return { ...reference };
    });
  }
  return result;
}
function revision(input, row) {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) invalid();
  if (input.expectedRevision !== row.revision) fail(409, 'This article changed. Reload it before continuing.');
}
function pagination(query, allowed = []) {
  fields(query, ['page', 'limit', ...allowed]);
  const number = (key, fallback, max) => {
    if (query[key] === undefined) return fallback;
    if (typeof query[key] !== 'string' || !/^[1-9]\d*$/.test(query[key]) || Number(query[key]) > max) invalid(); return Number(query[key]);
  };
  return { page: number('page', 1, 10000), limit: number('limit', 20, 50) };
}
async function list(Model, filter, paging, sort = { createdAt: -1, _id: -1 }) {
  const [rows, total] = await Promise.all([Model.find(filter).sort(sort).skip((paging.page - 1) * paging.limit).limit(paging.limit).maxTimeMS(5000).lean(), Model.countDocuments(filter).maxTimeMS(5000)]);
  return { rows, pagination: { ...paging, total, pages: Math.ceil(total / paging.limit) } };
}
function contentDTO(row) {
  const value = row.toObject ? row.toObject() : row;
  return Object.fromEntries(contentKeys.map(key => [key, value[key]]));
}
async function dto(row, { detail = false, privateView = false } = {}) {
  return { id: String(row._id), author: await community.authorDTO(row.author), title: row.title, subtitle: row.subtitle, slug: row.slug,
    excerpt: row.excerpt, coverImage: row.coverImage, tags: row.tags, category: row.category, status: row.status, revision: row.revision,
    publishedAt: row.publishedAt ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(detail ? { body: row.body, canonicalReferences: contentDTO(row).canonicalReferences } : {}),
    ...(privateView && detail ? { reviewReason: row.reviewReason ?? '' } : {}) };
}
async function transaction(work) {
  if (!await supportsTransactions()) fail(503, 'Article changes require transaction-capable storage.');
  try { return await mongoose.connection.transaction(work, transactionOptions); }
  catch (error) { if (['ValidationError', 'StrictModeError', 'CastError'].includes(error.name)) invalid(); throw error; }
}
async function requireModerator(actor, session) { if (!actor || !await community.globalModerator(actor, session)) fail(403, 'Moderator access is required.'); }
async function owned(id, actor, session) {
  const row = await Article.findOne({ _id: objectId(id), author: actor._id }).select('+reviewReason').session(session ?? null);
  if (!row) missing(); return row;
}
async function createDraft(input, actor) {
  const values = content(input, true);
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return dto(await Article.create({ ...values, author: actor._id, slug: slugs.makeSlug(values.title) }), { detail: true, privateView: true }); }
    catch (error) {
      if (error.code === 11000 && error.keyPattern?.slug) continue;
      if (['ValidationError', 'StrictModeError', 'CastError'].includes(error.name)) invalid(); throw error;
    }
  }
  fail(503, 'An article address could not be allocated. Please try again.');
}
async function published(query) {
  const paging = pagination(query, ['tag', 'category']); const filter = { status: 'published' };
  if (query.tag !== undefined) { if (typeof query.tag !== 'string' || query.tag.length > 32 || !tagPattern.test(query.tag)) invalid(); filter.tags = query.tag; }
  if (query.category !== undefined) { if (!categories.includes(query.category)) invalid(); filter.category = query.category; }
  const result = await list(Article, filter, paging, { publishedAt: -1, _id: -1 });
  return { items: await Promise.all(result.rows.map(row => dto(row))), pagination: result.pagination };
}
async function publicArticle(slug, query = {}) {
  fields(query, []); if (typeof slug !== 'string' || slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) missing();
  const row = await Article.findOne({ slug, status: 'published' }).lean(); if (!row) missing(); return dto(row, { detail: true });
}
async function mine(query, actor) {
  const paging = pagination(query, ['status']), filter = { author: actor._id };
  if (query.status !== undefined) { if (!statuses.includes(query.status)) invalid(); filter.status = query.status; }
  const result = await list(Article, filter, paging);
  return { items: await Promise.all(result.rows.map(row => dto(row))), pagination: result.pagination };
}
async function ownArticle(id, actor, query = {}) { fields(query, []); return dto(await owned(id, actor), { detail: true, privateView: true }); }
async function edit(id, input, actor) {
  const values = content(input); if (!Object.keys(values).length) invalid();
  const row = await transaction(async session => {
    const article = await owned(id, actor, session); revision(input, article);
    if (!['draft', 'rejected'].includes(article.status)) fail(409, 'Only drafts and rejected articles can be edited. Ask a moderator to unpublish a published article first.');
    Object.assign(article, values); article.status = 'draft'; article.reviewReason = ''; article.revision++;
    await article.save({ session }); return article;
  }); return dto(row, { detail: true, privateView: true });
}
async function archive(id, input, actor) {
  fields(input, []);
  const row = await transaction(async session => {
    const article = await owned(id, actor, session);
    if (article.status === 'published') fail(409, 'A moderator must unpublish this article first.');
    if (article.status !== 'archived') { article.status = 'archived'; article.revision++; await article.save({ session, validateModifiedOnly: true }); }
    return article;
  }); return { message: 'Article archived.', id: String(row._id) };
}
async function submit(id, input, actor) {
  fields(input, ['expectedRevision']);
  const row = await transaction(async session => {
    const article = await owned(id, actor, session); revision(input, article);
    if (!['draft', 'rejected'].includes(article.status)) fail(409, 'Only drafts and rejected articles can be submitted.');
    article.status = 'pending_review'; article.reviewReason = ''; article.revision++; await article.save({ session }); return article;
  }); return dto(row, { detail: true, privateView: true });
}
async function queue(query, actor) {
  await requireModerator(actor); const paging = pagination(query, ['status']);
  const status = query.status ?? 'pending_review'; if (!statuses.includes(status)) invalid();
  const result = await list(Article, { status }, paging, { createdAt: 1, _id: 1 });
  return { items: await Promise.all(result.rows.map(row => dto(row))), pagination: result.pagination };
}
async function reviewArticle(id, actor, query = {}) {
  fields(query, []); await requireModerator(actor);
  const row = await Article.findById(objectId(id)).select('+reviewReason'); if (!row) missing();
  return dto(row, { detail: true, privateView: true });
}
async function review(id, input, actor) {
  fields(input, ['action', 'reason', 'expectedRevision']); text(input.reason, 1000, true);
  if (!['approve', 'reject', 'unpublish', 'archive'].includes(input.action)) invalid();
  const row = await transaction(async session => {
    await requireModerator(actor, session);
    const article = await Article.findById(objectId(id)).select('+reviewReason').session(session); if (!article) missing();
    if (String(article.author) === String(actor._id)) fail(403, 'Another moderator must review your article.');
    revision(input, article); const previousStatus = article.status;
    if (input.action === 'approve' && article.status === 'pending_review') { article.status = 'published'; article.publishedAt = new Date(); }
    else if (input.action === 'reject' && article.status === 'pending_review') article.status = 'rejected';
    else if (input.action === 'unpublish' && article.status === 'published') article.status = 'draft';
    else if (input.action === 'archive' && article.status !== 'archived') article.status = 'archived';
    else fail(409, 'Invalid article publication transition.');
    article.reviewReason = input.reason; article.revision++;
    await article.save({ session, validateModifiedOnly: input.action !== 'approve' });
    if (input.action === 'approve') await Publication.create([{ article: article._id, author: article.author, approvedBy: actor._id, revision: article.revision,
      slug: article.slug, publishedAt: article.publishedAt, content: contentDTO(article), reason: input.reason }], { session });
    const audit = (await Audit.create([{ moderator: actor._id, targetType: 'article', targetId: article._id, action: input.action, reason: input.reason,
      previousStatus, resultingStatus: article.status, articleRevision: article.revision }], { session }))[0];
    await emitNotification({ recipient: article.author, actor: actor._id,
      type: input.action === 'approve' ? 'article_approved' : input.action === 'reject' ? 'article_rejected' : 'content_moderated',
      resourceType: 'article', resourceId: article._id, eventKey: `moderation:${audit._id}` }, session);
    return article;
  }); return dto(row, { detail: true, privateView: true });
}
async function publications(id, query, actor, moderator = false) {
  if (moderator) { await requireModerator(actor); if (!await Article.exists({ _id: objectId(id) })) missing(); }
  else await owned(id, actor);
  const result = await list(Publication, { article: objectId(id) }, pagination(query));
  return { items: result.rows.map(row => ({ id: String(row._id), revision: row.revision, slug: row.slug, publishedAt: row.publishedAt,
    approvedBy: String(row.approvedBy), reason: row.reason, content: row.content })), pagination: result.pagination };
}
module.exports = { createDraft, published, publicArticle, mine, ownArticle, edit, archive, submit, queue, reviewArticle, review, publications };
