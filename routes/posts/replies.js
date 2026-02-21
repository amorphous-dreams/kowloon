// routes/posts/replies.js
// GET /posts/:id/replies — Replies to a post

import makeCollection from "../utils/makeCollection.js";
import { Reply } from "#schema";

export default makeCollection({
  model: Reply,
  buildQuery: (req) => ({
    target: decodeURIComponent(req.params.id),
    deletedAt: null,
  }),
  sort: { createdAt: 1 },
});
