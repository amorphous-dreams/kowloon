// /ActivityParser/handlers/Undo/index.js
// Handle incoming Undo activities from remote servers.
//
// Only case handled: Undo{React}/Undo{Like} — a remote actor removed a
// reaction. (Undo{Follow} was removed along with the Follow/Unfollow/Accept
// handlers — Circles are the only follow mechanism now.)

import { React as ReactModel } from "#schema";
import logger from "#methods/utils/logger.js";
import { syncTargetReactState } from "../React/index.js";

export function validate(activity) {
  if (!activity?.actorId) {
    return { valid: false, errors: ["Undo: missing actorId"] };
  }
  if (!activity?.object) {
    return { valid: false, errors: ["Undo: missing object (the activity being undone)"] };
  }
  return { valid: true };
}

export default async function Undo(activity) {
  try {
    const validation = validate(activity);
    if (!validation.valid) {
      return { activity, error: validation.errors.join("; ") };
    }

    const undoneActivity = typeof activity.object === "object" ? activity.object : null;
    const undoneType = undoneActivity?.type ?? null;

    // --- Undo{React/Like}: remote actor removed their reaction ---
    // (Kowloon peers clear via an empty React; this covers ActivityPub peers
    // that send a proper Undo, plus any older Kowloon servers.)
    if (undoneType === "React" || undoneType === "Like") {
      const remoteActorId = activity.actorId;
      const targetId =
        undoneActivity.to ||
        undoneActivity.target ||
        undoneActivity.object?.target ||
        undoneActivity.object ||
        null;
      if (!targetId || typeof targetId !== "string") {
        return { activity, result: { status: "no_target" }, federation: { shouldFederate: false } };
      }
      const res = await ReactModel.deleteMany({ actorId: remoteActorId, target: targetId });
      if (res?.deletedCount > 0) {
        await syncTargetReactState(targetId);
      }
      logger.info("Undo React: removed remote reaction", {
        remoteActorId,
        targetId,
        removed: res?.deletedCount || 0,
      });
      return {
        activity,
        result: { status: res?.deletedCount > 0 ? "unreacted" : "not_reacted" },
        federation: { shouldFederate: false },
      };
    }

    // --- Anything else: acknowledge but take no action ---
    logger.info("Undo: received but not handled", { undoneType, actorId: activity.actorId });
    return {
      activity,
      result: { status: "ignored", undoneType },
      federation: { shouldFederate: false },
    };
  } catch (err) {
    return { activity, error: `Undo: ${err.message}` };
  }
}
