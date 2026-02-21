// routes/home/index.js
// GET / — Server info endpoint

import express from "express";
import route from "../utils/route.js";
import getSettings from "#methods/settings/get.js";

const router = express.Router({ mergeParams: true });

router.get(
  "/",
  route(async ({ set }) => {
    const settings = await getSettings();

    set("type", "Service");
    set("name", settings?.profile?.name || "Kowloon");
    set("subtitle", settings?.profile?.subtitle || undefined);
    set("description", settings?.profile?.description || undefined);
    set("domain", settings?.domain || undefined);
    set("icon", settings?.profile?.icon || undefined);
    set("registrationIsOpen", !!settings?.registrationIsOpen);
    set("adminEmail", settings?.adminEmail || undefined);
    set("endpoints", {
      users: `/users`,
      posts: `/posts`,
      groups: `/groups`,
      pages: `/pages`,
      outbox: `/outbox`,
      inbox: `/inbox`,
    });
  })
);

export default router;
