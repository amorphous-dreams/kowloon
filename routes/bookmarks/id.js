// routes/bookmarks/id.js
// GET /bookmarks/:id — Single bookmark by ID

import makeGetById from "../utils/makeGetById.js";
export default makeGetById({ mode: "local" });
