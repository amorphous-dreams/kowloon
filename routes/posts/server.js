// routes/posts/server.js
// GET /posts/server — Server-only posts (to: "@<domain>"), requires local auth

import route from "../utils/route.js";
import { Post } from "#schema";
import { activityStreamsCollection } from "../utils/oc.js";
import { getSetting } from "#methods/settings/cache.js";
import sanitizeObject from "#methods/sanitize/object.js";
import isLocalDomain from "#methods/parse/isLocalDomain.js";
import kowloonId from "#methods/parse/kowloonId.js";

export default route(async ({ req, query, user, set, setStatus }) => {
  if (!user?.id) {
    setStatus(401);
    set("error", "Authentication required");
    return;
  }

  // Only local users can view server posts
  const parsed = kowloonId(user.id);
  if (!parsed.domain || !isLocalDomain(parsed.domain)) {
    setStatus(403);
    set("error", "Server posts are only visible to local users");
    return;
  }

  const domain = getSetting("domain");
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
  const skip = (page - 1) * limit;

  const filter = {
    to: `@${domain}`,
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
  const base = `${protocol}://${domain}/posts/server`;

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
