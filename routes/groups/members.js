// routes/groups/members.js
// GET /groups/:id/members — Group members list

import route from "../utils/route.js";
import { Group, Circle } from "#schema";
import { getSetting } from "#methods/settings/cache.js";
import isLocalDomain from "#methods/parse/isLocalDomain.js";
import kowloonId from "#methods/parse/kowloonId.js";

export default route(async ({ req, params, user, set, setStatus }) => {
  const groupId = decodeURIComponent(params.id);
  const group = await Group.findOne({ id: groupId, deletedAt: null }).lean();

  if (!group) {
    setStatus(404);
    set("error", "Group not found");
    return;
  }

  const domain = getSetting("domain");
  const toValue = (group.to || "").toLowerCase().trim();

  // Check visibility
  let isLocal = false;
  if (user?.id) {
    const parsed = kowloonId(user.id);
    isLocal = parsed.domain && isLocalDomain(parsed.domain);
  }

  if (toValue === `@${domain}` && !isLocal) {
    setStatus(403);
    set("error", "Access denied");
    return;
  }

  if (toValue !== "@public" && toValue !== `@${domain}` && !user?.id) {
    setStatus(401);
    set("error", "Authentication required");
    return;
  }

  // Get members from the group's members circle
  if (!group.circles?.members) {
    set("members", []);
    set("totalItems", 0);
    return;
  }

  const membersCircle = await Circle.findOne({ id: group.circles.members })
    .select("members")
    .lean();

  const members = (membersCircle?.members || []).map((m) => ({
    id: m.id,
    name: m.name,
    icon: m.icon,
    url: m.url,
  }));

  set("members", members);
  set("totalItems", members.length);
});
