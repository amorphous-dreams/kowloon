// routes/circles/posts.js
// GET /circles/:id/posts — Primary timeline view (circle-based feed)

import route from "../utils/route.js";
import { Circle } from "#schema";
import getTimeline from "#methods/feed/getTimeline.js";

export default route(async ({ req, params, query, user, set, setStatus }) => {
  if (!user?.id) {
    setStatus(401);
    set("error", "Authentication required");
    return;
  }

  const circleId = decodeURIComponent(params.id);

  // Verify ownership
  const circle = await Circle.findOne({ id: circleId, deletedAt: null })
    .select("actorId")
    .lean();

  if (!circle) {
    setStatus(404);
    set("error", "Circle not found");
    return;
  }

  if (circle.actorId !== user.id) {
    setStatus(403);
    set("error", "Access denied");
    return;
  }

  const types = query.types
    ? String(query.types).split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const since = query.since || null;
  const limit = Math.min(Number(query.limit) || 50, 500);

  const result = await getTimeline({
    viewerId: user.id,
    circleId,
    types,
    since,
    limit,
  });

  set("@context", "https://www.w3.org/ns/activitystreams");
  set("type", "OrderedCollection");
  set("totalItems", result.items.length);
  set("orderedItems", result.items);
  if (result.nextCursor) {
    set("next", result.nextCursor);
  }
});
