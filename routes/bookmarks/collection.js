// routes/bookmarks/collection.js
// GET /bookmarks — List bookmarks (public ones for unauthenticated, own for authenticated)

import makeCollection from "../utils/makeCollection.js";
import { Bookmark } from "#schema";

export default makeCollection({
  model: Bookmark,
  buildQuery: (_req, { user }) => {
    const filter = { deletedAt: null };
    if (user?.id) {
      // Authenticated: show own bookmarks + public ones
      filter.$or = [{ actorId: user.id }, { to: "@public" }];
    } else {
      // Unauthenticated: only public
      filter.to = "@public";
    }
    return filter;
  },
  select:
    "id type title summary href target image tags to actorId url createdAt updatedAt",
});
