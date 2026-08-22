// /ActivityParser/index.js (ESM)
// Builds the verb dispatch table: scans handlers/, auto-registers each
// subfolder's default-exported handler function under its directory name.
// The real write path (methods/activities/create.js, used by both /outbox
// and /inbox) calls `parser[activity.type]` directly after validating the
// envelope against ActivityParser/activity.schema.js -- this factory does
// not do any validation itself.
import { readdir, access } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { constants } from "fs";

export default async function ActivityParser() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const HANDLERS_DIR = join(__dirname, "handlers");

  const activity = async function () {};

  const entries = await readdir(HANDLERS_DIR, { withFileTypes: true });

  await Promise.all(entries.filter(e => e.isDirectory()).map(async (dirent) => {
    const verb = dirent.name;

    // Skip utility directories (not handlers)
    if (verb === 'utils') return;

    const handlerPath = join(HANDLERS_DIR, verb, "index.js");
    try {
      await access(handlerPath, constants.R_OK);
      const modUrl = pathToFileURL(handlerPath).href;
      const mod = await import(modUrl);
      if (typeof mod.default === "function") {
        Object.defineProperty(activity, verb, { enumerable: true, value: mod.default });
      }
    } catch (err) {
      // Handler doesn't exist or isn't readable - skip
    }
  }));

  Object.defineProperty(activity, "verbs", {
    enumerable: true,
    value: entries.filter(e => e.isDirectory()).map(e => e.name),
  });

  return activity;
}
