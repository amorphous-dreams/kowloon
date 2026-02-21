// routes/groups/collection.js
// GET /groups — List groups visible to the viewer

import makeCollection from "../utils/makeCollection.js";
import { Group } from "#schema";
import { getSetting } from "#methods/settings/cache.js";
import isLocalDomain from "#methods/parse/isLocalDomain.js";
import kowloonId from "#methods/parse/kowloonId.js";

export default makeCollection({
  model: Group,
  buildQuery: (req, { user }) => {
    const domain = getSetting("domain");
    const filter = { deletedAt: null };

    // Determine viewer locality
    let isLocal = false;
    if (user?.id) {
      const parsed = kowloonId(user.id);
      isLocal = parsed.domain && isLocalDomain(parsed.domain);
    }

    if (!user?.id) {
      // Unauthenticated: only public groups
      filter.to = "@public";
    } else if (!isLocal) {
      // Remote authenticated: only public groups
      filter.to = "@public";
    } else {
      // Local authenticated: public + server groups
      filter.to = { $in: ["@public", `@${domain}`] };
    }

    return filter;
  },
  select:
    "id name description icon to rsvpPolicy memberCount url createdAt updatedAt",
  sanitize: (doc) => {
    const { _id, __v, ...rest } = doc;
    return rest;
  },
});
