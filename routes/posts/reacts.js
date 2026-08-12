// routes/posts/reacts.js
// GET /posts/:id/reacts — Reactions to a post

import makeCollection from "../utils/makeCollection.js";
import { React } from "#schema";
import { excludeBlockedMuted } from "#methods/visibility/context.js";

export default makeCollection({
  model: React,
  buildQuery: async (req, { user }) => {
    const filter = {
      target: decodeURIComponent(req.params.id),
      deletedAt: null,
    };
    await excludeBlockedMuted(filter, user?.id);
    return filter;
  },
  sort: { createdAt: -1 },
});
