// routes/users/bookmarks.js
// GET /users/:id/bookmarks — User's bookmarks

import makeCollection from "../utils/makeCollection.js";
import { Bookmark } from "#schema";

export default makeCollection({
  model: Bookmark,
  buildQuery: (req, { user }) => {
    const userId = decodeURIComponent(req.params.id);
    const filter = {
      actorId: userId,
      deletedAt: null,
    };

    // Owner sees all, others see only public
    if (!user?.id || user.id !== userId) {
      filter.to = "@public";
    }

    return filter;
  },
  select:
    "id type title summary href target image tags to actorId url createdAt updatedAt",
});
