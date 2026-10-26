const Circle = require('../models/ReadingCircle'), Membership = require('../models/CircleMembership');
// The existing moderation boundary: private circle material remains visible
// only to its owner or active members, even for a global moderator/admin.
function circleVisibilityStages(actor) {
  return [
    { $lookup: { from: Circle.collection.name, localField: 'circle', foreignField: '_id', as: 'circleAccess' } },
    { $lookup: { from: Membership.collection.name, let: { circleId: '$circle' }, pipeline: [
      { $match: { user: actor._id, status: 'active', $expr: { $eq: ['$circle', '$$circleId'] } } }, { $limit: 1 }, { $project: { _id: 1 } },
    ], as: 'memberAccess' } },
    { $match: { $or: [{ circle: null }, { 'circleAccess.visibility': 'public' }, { 'circleAccess.owner': actor._id }, { 'memberAccess.0': { $exists: true } }] } },
  ];
}
module.exports = { circleVisibilityStages };
