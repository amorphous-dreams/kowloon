// routes/groups/index.js

import express from "express";
import collection from "./collection.js";
import id from "./id.js";
import members from "./members.js";
import posts from "./posts.js";

const router = express.Router({ mergeParams: true });

router.get("/", collection);
router.get("/:id", id);
router.get("/:id/members", members);
router.get("/:id/posts", posts);

export default router;
