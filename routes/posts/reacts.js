// routes/posts/reacts.js
// GET /posts/:id/reacts — Reactions to a post

import makeCollection from "../utils/makeCollection.js";
import { React } from "#schema";

export default makeCollection({
  model: React,
  buildQuery: (req) => ({
    target: decodeURIComponent(req.params.id),
    deletedAt: null,
  }),
  sort: { createdAt: -1 },
});
