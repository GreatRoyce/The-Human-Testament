const Notification = require('../models/Notification');
const { notificationAccess, recipientForNotification } = require('./notificationResource.service');
const { assertNotificationStorage } = require('./notificationStorage');
// Internal transaction-only producer. No HTTP endpoint accepts these values.
// Email delivery is intentionally absent: there are no activity preferences or
// durable activity-email worker in this project yet.
async function emitNotification({ recipient, actor, type, resourceType, resourceId, eventKey }, session) {
  if (!session?.inTransaction()) throw new Error('Notification creation requires its originating transaction.');
  if (actor && String(actor) === String(recipient)) return;
  const user = await recipientForNotification(recipient, session); if (!user) return;
  const data = { recipient: user._id, ...(actor ? { actor } : {}), type, resourceType, resourceId, eventKey, message: Notification.messages[type] };
  if (!await notificationAccess(data, user, session)) return;
  await assertNotificationStorage();
  // Validate strict model enums/types even for an upsert replay, and retain the
  // original readAt/createdAt on duplicate delivery of the same durable event.
  await new Notification(data).validate();
  await Notification.updateOne({ recipient: user._id, eventKey }, { $setOnInsert: { ...data, createdAt: new Date(), readAt: null } },
    { session, upsert: true, runValidators: true, timestamps: false, setDefaultsOnInsert: true });
}
module.exports = { emitNotification };
