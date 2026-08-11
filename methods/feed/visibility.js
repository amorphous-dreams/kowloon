// /methods/feed/visibility.js
// Visibility and capability evaluators for FeedItems items
// Used by all GET endpoints to determine what viewers can see and do

import { Circle, Group, FeedFanOut, User } from "#schema";
import { getServerSettings } from "#methods/settings/schemaHelpers.js";
import logger from "#methods/utils/logger.js";

/**
 * Check if a viewer has an explicit FeedFanOut grant for an item.
 * This is the authoritative audience check for local "audience"-visibility items.
 * @param {string} feedItemId
 * @param {string} viewerId
 * @returns {Promise<boolean>}
 */
async function isInFanOutAudience(feedItemId, viewerId) {
  if (!feedItemId || !viewerId) return false;
  const entry = await FeedFanOut.findOne({ feedItemId, to: viewerId }).lean();
  return Boolean(entry);
}

/**
 * Check if viewer can see a FeedItems item
 * @param {Object} feedCacheItem - FeedItems document
 * @param {string|null} viewerId - Viewer's ID (null = anonymous)
 * @param {Object} context - Pre-loaded context { followerMap, membershipMap, grants }
 * @returns {Promise<boolean>}
 */
export async function canView(feedCacheItem, viewerId, context = {}) {
  const { to, origin } = feedCacheItem;
  const {
    followerMap = new Map(),
    membershipMap = new Map(),
    grants = {},
  } = context;

  // "public" → everyone can see
  if (to === "public" || to === "@public") {
    return true;
  }

  // "server" → local users only (or expose to all if you want)
  if (to === "server") {
    if (!viewerId) return false; // Anonymous can't see server-only
    const { domain } = getServerSettings();
    const isLocalViewer = viewerId
      ?.toLowerCase()
      .endsWith(`@${domain?.toLowerCase()}`);
    return isLocalViewer;
  }

  // "audience" → depends on origin
  if (to === "audience") {
    if (!viewerId) return false;
    if (feedCacheItem.actorId === viewerId) return true; // owner always sees own posts
    // FeedFanOut is authoritative for both local and remote audience posts
    // (remote group posts create per-user FeedFanOut records via enqueueFanOut)
    return isInFanOutAudience(feedCacheItem.id, viewerId);
  }

  return false;
}

/**
 * Build follower map: actorId -> Set of follower IDs
 * @param {string[]} actorIds - Actor IDs to check
 * @returns {Promise<Map<string, Set<string>>>}
 */
export async function buildFollowerMap(actorIds = []) {
  if (actorIds.length === 0) return new Map();

  const { User } = await import("#schema");

  const users = await User.find({ deletedAt: null, active: { $ne: false } })
    .select("id following")
    .lean();

  if (users.length === 0) return new Map();

  // Get all unique following circle IDs
  const followingCircleIds = users.map((u) => u.following).filter(Boolean);
  if (followingCircleIds.length === 0) return new Map();

  // Batch fetch all following circles
  const followingCircles = await Circle.find({
    id: { $in: followingCircleIds },
  }).lean();

  // Build map: circleId -> member IDs
  const circleMembers = new Map();
  for (const circle of followingCircles) {
    const memberIds = (circle.members || []).map((m) => m.id).filter(Boolean);
    circleMembers.set(circle.id, memberIds);
  }

  // Build reverse map: actorId -> Set of followers
  const followerMap = new Map();
  for (const user of users) {
    if (!user.following) continue;
    const following = circleMembers.get(user.following) || [];
    for (const followedId of following) {
      if (!followerMap.has(followedId)) {
        followerMap.set(followedId, new Set());
      }
      followerMap.get(followedId).add(user.id);
    }
  }

  return followerMap;
}

/**
 * Check if viewer follows author
 * @param {string} viewerId - The viewer
 * @param {string} authorId - The author
 * @param {Map<string, Set<string>>} followerMap - Pre-built follower map
 * @returns {boolean}
 */
export function follows(viewerId, authorId, followerMap) {
  const followers = followerMap.get(authorId);
  return followers ? followers.has(viewerId) : false;
}

/**
 * Build membership map for circles/groups
 * @param {string[]} objectIds - Circle/Group IDs
 * @returns {Promise<Map<string, Set<string>>>}
 */
export async function buildMembershipMap(objectIds) {
  if (!objectIds || objectIds.length === 0) return new Map();

  const membershipMap = new Map();

  // Group by type
  const circleIds = objectIds.filter((id) => id.startsWith("circle:"));
  const groupIds = objectIds.filter((id) => id.startsWith("group:"));

  // Batch fetch
  const [circles, groups] = await Promise.all([
    circleIds.length > 0 ? Circle.find({ id: { $in: circleIds } }).lean() : [],
    groupIds.length > 0 ? Group.find({ id: { $in: groupIds } }).lean() : [],
  ]);

  // Build map
  for (const obj of [...circles, ...groups]) {
    const memberIds = (obj.members || []).map((m) => m.id).filter(Boolean);
    membershipMap.set(obj.id, new Set(memberIds));
  }

  return membershipMap;
}

/**
 * Check if viewer is in local audience
 * @param {string} viewerId - The viewer
 * @param {string[]} addressedIds - LOCAL circle/group IDs
 * @param {Map<string, Set<string>>} membershipMap - Pre-built membership map
 * @returns {boolean}
 */
export function inLocalAudience(viewerId, addressedIds, membershipMap) {
  if (!addressedIds || addressedIds.length === 0) return false;

  for (const id of addressedIds) {
    const members = membershipMap.get(id);
    if (members?.has(viewerId)) return true;
  }

  return false;
}

/**
 * Evaluate per-viewer capability (canReply/canReact)
 * @param {Object} opts
 * @param {string} opts.viewerId - The viewer
 * @param {string} opts.authorId - The author
 * @param {string} opts.capability - Capability value ("public"|"followers"|"audience"|"none")
 * @param {string} opts.origin - Origin ("local"|"remote")
 * @param {string} opts.feedItemId - FeedItems.id (used for local audience check via FeedFanOut)
 * @param {string[]} opts.addressedIds - LOCAL addressed IDs (for local content)
 * @param {Object} opts.grants - Remote grants object (for remote content)
 * @param {Map} opts.followerMap - Pre-built follower map
 * @param {Map} opts.membershipMap - Pre-built membership map
 * @returns {Promise<boolean>}
 */
export async function evaluateCapability({
  viewerId,
  authorId,
  capability,
  origin,
  feedItemId,
  addressedIds = [],
  grants = {},
  followerMap,
  membershipMap,
}) {
  if (!capability || typeof capability !== "string") return false;

  const cap = capability.toLowerCase().trim();

  // "none" → always false
  if (cap === "none") return false;

  // Not logged in → false (even for "public" - must be authenticated to reply/react)
  if (!viewerId) return false;

  // "public" → true for any authenticated user
  if (cap === "public" || cap === "@public") return true;

  // "followers" → check if viewer follows author
  if (cap === "followers") {
    return follows(viewerId, authorId, followerMap);
  }

  // "audience" → FeedFanOut is authoritative for both local and remote posts.
  // For local posts, try membership map first (avoids a DB query when addressedIds are available).
  if (cap === "audience") {
    if (origin !== "remote" && addressedIds.length > 0 && inLocalAudience(viewerId, addressedIds, membershipMap)) {
      return true;
    }
    return isInFanOutAudience(feedItemId, viewerId);
  }

  return false;
}

/**
 * Enrich FeedItems item with per-viewer capabilities
 * @param {Object} feedCacheItem - FeedItems document
 * @param {string|null} viewerId - Viewer's ID (null = anonymous)
 * @param {Object} context - Pre-loaded context { followerMap, membershipMap, grants, addressedIds }
 * @returns {Promise<Object>} - Item with canReply/canReact booleans
 */
export async function enrichWithCapabilities(feedCacheItem, viewerId, context = {}) {
  const {
    followerMap = new Map(),
    membershipMap = new Map(),
    grants = {},
    addressedIds = [],
  } = context;

  const { id: feedItemId, actorId, origin, canReply, canReact } = feedCacheItem;

  const [canReplyBool, canReactBool] = await Promise.all([
    evaluateCapability({
      viewerId,
      authorId: actorId,
      capability: canReply,
      origin,
      feedItemId,
      addressedIds,
      grants,
      followerMap,
      membershipMap,
    }),
    evaluateCapability({
      viewerId,
      authorId: actorId,
      capability: canReact,
      origin,
      feedItemId,
      addressedIds,
      grants,
      followerMap,
      membershipMap,
    }),
  ]);

  return {
    ...feedCacheItem,
    canReply: canReplyBool,
    canReact: canReactBool,
  };
}

/**
 * Authorize an interaction (Reply/React) against an existing FeedItems
 * target. This is the single gate for ALL rejection reasons — target
 * missing, not visible to the actor, actor is blocked by the target's
 * author, or the relevant capability (canReply/canReact) is off.
 *
 * All but the capability case return an IDENTICAL generic 404: a requester
 * can't distinguish "blocked" from "not addressed to you" from "doesn't
 * exist". This is deliberate — Kowloon's relationship model is built on
 * ambiguity (circle membership is private, nobody gets an "unfollowed"
 * signal), and a distinguishing error for "you're blocked" would itself be a
 * disclosure the moment someone blocks you. The capability-disabled case is
 * NOT sensitive (the actor can already see the post; the author just turned
 * off replies/reactions) so it gets a real 403 + message, like X's "replies
 * are limited" state.
 *
 * The real reason is always logged server-side (structured, at info level)
 * so debugging "why didn't this go through" is never actually blind — the
 * ambiguity is purely client-facing.
 *
 * See kowloon-network/kowloon#40.
 *
 * @param {Object} opts
 * @param {string} opts.actorId - the user attempting to interact
 * @param {string} opts.targetId - the FeedItems id being replied to / reacted to
 * @param {"canReply"|"canReact"} [opts.capability] - omit to only check visibility+block
 * @returns {Promise<{ok:true}|{ok:false,status:number,message:string,reason:string}>}
 */
export async function authorizeInteraction({ actorId, targetId, capability }) {
  function deny(status, message, reason) {
    logger.info("Interaction denied", {
      reason,
      actorId,
      targetId,
      capability: capability || null,
    });
    return { ok: false, status, message, reason };
  }

  const feedCacheItem = await FeedItems.findOne({
    id: targetId,
    deletedAt: null,
    tombstoned: { $ne: true },
  }).lean();
  if (!feedCacheItem) return deny(404, "Not found", "not_found");

  const followerMap = await buildFollowerMap([feedCacheItem.actorId]);
  const visible = await canView(feedCacheItem, actorId, { followerMap });
  if (!visible) return deny(404, "Not found", "not_visible");

  // Block: the target's author has blocked this actor. Skip when the actor
  // IS the author (can't block yourself out of your own content).
  if (feedCacheItem.actorId && feedCacheItem.actorId !== actorId) {
    const author = await User.findOne({ id: feedCacheItem.actorId })
      .select("circles.blocked")
      .lean();
    if (author?.circles?.blocked) {
      const blockedCircle = await Circle.findOne({ id: author.circles.blocked })
        .select("members.id")
        .lean();
      const blockedIds = new Set((blockedCircle?.members ?? []).map((m) => m.id));
      if (blockedIds.has(actorId)) return deny(404, "Not found", "blocked");
    }
  }

  if (capability) {
    const enriched = await enrichWithCapabilities(feedCacheItem, actorId, { followerMap });
    const allowed = capability === "canReply" ? enriched.canReply : enriched.canReact;
    if (!allowed) {
      const label = capability === "canReply" ? "Replies" : "Reactions";
      return deny(403, `${label} are disabled on this post.`, `${capability}_false`);
    }
  }

  return { ok: true };
}

/**
 * Build visibility filter for FeedItems queries
 * @param {string|null} viewerId - Viewer's ID (null = anonymous)
 * @returns {Object} - MongoDB filter
 */
export function buildVisibilityFilter(viewerId) {
  if (!viewerId) {
    // Anonymous: only public items
    return {
      to: { $in: ["public", "@public"] },
      deletedAt: null,
      tombstoned: { $ne: true },
    };
  }

  // Authenticated: public + server (if local).
  // "audience" items are authorized via FeedFanOut and are NOT included in this filter —
  // callers that need audience items should use getTimeline() (which queries FeedFanOut first)
  // or check canView() per-item.
  const { domain } = getServerSettings();
  const isLocalViewer = viewerId
    ?.toLowerCase()
    .endsWith(`@${domain?.toLowerCase()}`);

  const toFilter = isLocalViewer
    ? { $in: ["public", "@public", "server"] }
    : { $in: ["public", "@public"] };

  return {
    to: toFilter,
    deletedAt: null,
    tombstoned: { $ne: true },
  };
}

export default {
  canView,
  buildFollowerMap,
  buildMembershipMap,
  follows,
  inLocalAudience,
  evaluateCapability,
  enrichWithCapabilities,
  authorizeInteraction,
  buildVisibilityFilter,
};
