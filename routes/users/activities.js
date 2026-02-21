// routes/users/activities.js
// GET /users/:id/activities — User's activity log

import makeCollection from "../utils/makeCollection.js";
import { Activity } from "#schema";

export default makeCollection({
  model: Activity,
  buildQuery: (req) => ({
    actorId: decodeURIComponent(req.params.id),
    deletedAt: null,
  }),
  select: "id type actorId objectType objectId to createdAt",
  sort: { createdAt: -1 },
});
