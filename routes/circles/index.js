// routes/circles/index.js
// Circle endpoints — all require authentication, scoped to circle owner

import express from "express";
import id from "./id.js";
import posts from "./posts.js";
import route from "../utils/route.js";
import { Circle } from "#schema";
import { activityStreamsCollection } from "../utils/oc.js";
import { getSetting } from "#methods/settings/cache.js";

const router = express.Router({ mergeParams: true });

// GET /circles — List viewer's own circles
router.get(
  "/",
  route(async ({ req, query, user, set, setStatus }) => {
    if (!user?.id) {
      setStatus(401);
      set("error", "Authentication required");
      return;
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
    const skip = (page - 1) * limit;

    const filter = { actorId: user.id, deletedAt: null };

    const [docs, total] = await Promise.all([
      Circle.find(filter)
        .select("id name summary icon memberCount to createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Circle.countDocuments(filter),
    ]);

    const domain = getSetting("domain");
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const base = `${protocol}://${domain}/circles`;

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
  })
);

router.get("/:id", id);
router.get("/:id/posts", posts);

export default router;
