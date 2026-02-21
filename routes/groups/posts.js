// routes/groups/posts.js
// GET /groups/:id/posts — Posts addressed to a group

import route from "../utils/route.js";
import { Group, Post, Circle } from "#schema";
import { activityStreamsCollection } from "../utils/oc.js";
import { getSetting } from "#methods/settings/cache.js";
import sanitizeObject from "#methods/sanitize/object.js";
import isLocalDomain from "#methods/parse/isLocalDomain.js";
import kowloonId from "#methods/parse/kowloonId.js";

export default route(async ({ req, params, query, user, set, setStatus }) => {
  const groupId = decodeURIComponent(params.id);
  const group = await Group.findOne({ id: groupId, deletedAt: null }).lean();

  if (!group) {
    setStatus(404);
    set("error", "Group not found");
    return;
  }

  const domain = getSetting("domain");
  const toValue = (group.to || "").toLowerCase().trim();

  // Determine viewer locality
  let isLocal = false;
  if (user?.id) {
    const parsed = kowloonId(user.id);
    isLocal = parsed.domain && isLocalDomain(parsed.domain);
  }

  // For non-public groups, check if viewer can access
  if (toValue !== "@public") {
    if (!user?.id) {
      setStatus(401);
      set("error", "Authentication required");
      return;
    }
    if (toValue === `@${domain}` && !isLocal) {
      setStatus(403);
      set("error", "Access denied");
      return;
    }
    // For private groups, verify membership
    if (toValue !== `@${domain}` && group.circles?.members) {
      const membersCircle = await Circle.findOne({
        id: group.circles.members,
        "members.id": user.id,
      }).lean();
      if (!membersCircle) {
        setStatus(403);
        set("error", "Access denied");
        return;
      }
    }
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
  const skip = (page - 1) * limit;

  const filter = {
    to: groupId,
    deletedAt: null,
  };
  if (query.type) filter.type = query.type;
  if (query.since) filter.createdAt = { $gte: new Date(query.since) };

  const [docs, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Post.countDocuments(filter),
  ]);

  const items = docs.map((doc) => sanitizeObject(doc, { objectType: "Post" }));

  const protocol = req.headers["x-forwarded-proto"] || "https";
  const base = `${protocol}://${domain}/groups/${encodeURIComponent(groupId)}/posts`;

  const collection = activityStreamsCollection({
    id: `${base}?page=${page}`,
    orderedItems: items,
    totalItems: total,
    page,
    itemsPerPage: limit,
    baseUrl: base,
  });

  for (const [key, value] of Object.entries(collection)) {
    set(key, value);
  }
});
