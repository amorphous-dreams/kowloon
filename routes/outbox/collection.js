// routes/outbox/collection.js
// GET /outbox — S2S pull federation endpoint
// Returns an OrderedCollection of recent public activities for remote servers.
// Requires S2S authentication (HTTP Signature).

import route from "../utils/route.js";
import { Activity } from "#schema";
import { activityStreamsCollection } from "../utils/oc.js";
import { getSetting } from "#methods/settings/cache.js";
import Kowloon from "#kowloon";

export default route(
  async ({ req, query, set, setStatus }) => {
    // Verify S2S authentication via HTTP Signature
    const sig = await Kowloon.federation.verifyHttpSignature(req);
    if (!sig.ok) {
      setStatus(401);
      set("error", sig.error || "S2S authentication required");
      return;
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
    const skip = (page - 1) * limit;

    // Only return public activities
    const filter = {
      deletedAt: null,
      $or: [{ to: "@public" }, { "object.to": "@public" }],
    };

    if (query.since) {
      filter.createdAt = { $gte: new Date(query.since) };
    }
    if (query.type) {
      filter.type = query.type;
    }

    const [docs, total] = await Promise.all([
      Activity.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(filter),
    ]);

    const domain = getSetting("domain");
    const base = `https://${domain}/outbox`;

    const collection = activityStreamsCollection({
      id: `${base}?page=${page}`,
      orderedItems: docs,
      totalItems: total,
      page,
      itemsPerPage: limit,
      baseUrl: base,
    });

    for (const [key, value] of Object.entries(collection)) {
      set(key, value);
    }
  },
  { allowUnauth: true } // Auth is via HTTP Signature, not JWT
);
