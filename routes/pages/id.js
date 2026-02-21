// routes/pages/id.js
// GET /pages/:id — Single page by ID or slug

import route from "../utils/route.js";
import { Page } from "#schema";

export default route(async ({ params, set, setStatus }) => {
  const idOrSlug = decodeURIComponent(params.id);

  // Try by id first, then by slug
  const page =
    (await Page.findOne({ id: idOrSlug, deletedAt: null }).lean()) ||
    (await Page.findOne({ slug: idOrSlug, deletedAt: null }).lean());

  if (!page) {
    setStatus(404);
    set("error", "Page not found");
    return;
  }

  set("item", page);
});
