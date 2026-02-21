// routes/circles/id.js
// GET /circles/:id — Circle details (owner-only)

import route from "../utils/route.js";
import { Circle } from "#schema";

export default route(async ({ req, params, user, set, setStatus }) => {
  if (!user?.id) {
    setStatus(401);
    set("error", "Authentication required");
    return;
  }

  const id = decodeURIComponent(params.id);
  const circle = await Circle.findOne({ id, deletedAt: null }).lean();

  if (!circle) {
    setStatus(404);
    set("error", "Circle not found");
    return;
  }

  // Only the circle owner can view it
  if (circle.actorId !== user.id) {
    setStatus(403);
    set("error", "Access denied");
    return;
  }

  set("item", circle);
});
