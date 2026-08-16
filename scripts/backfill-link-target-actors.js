#!/usr/bin/env node
// Backfill targetActor for existing Link posts that have a `target` but no
// `targetActor` (created before #44 shipped). Idempotent — only touches
// posts where targetActor is unset; safe to re-run. Updates both the Post
// document and its FeedItems cache entry (feeds render from the cache, not
// Post directly).
//
// Usage:
//   node scripts/backfill-link-target-actors.js            # dry run (counts only)
//   node scripts/backfill-link-target-actors.js --write     # apply
//   node scripts/backfill-link-target-actors.js --write --limit 50

import "dotenv/config";
import mongoose from "mongoose";
import { Post, FeedItems, Settings } from "#schema";
import { loadSettings } from "#methods/settings/cache.js";

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--write");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

async function main() {
  const mongoUrl =
    process.env.MONGO_URI || process.env.MONGO_URL || "mongodb://localhost:27017/kowloon";
  await mongoose.connect(mongoUrl);
  await loadSettings(Settings);
  console.log(`Connected: ${mongoUrl}`);
  console.log(DRY_RUN ? "DRY RUN — pass --write to apply" : "WRITE MODE");

  const query = {
    type: "Link",
    target: { $nin: [null, ""] },
    targetActor: { $exists: false },
    deletedAt: null,
  };
  const cursor = Post.find(query).select("id target").lean().cursor();

  let seen = 0, done = 0, skipped = 0;
  for (let p = await cursor.next(); p != null; p = await cursor.next()) {
    seen++;
    if (LIMIT && done >= LIMIT) break;
    if (DRY_RUN) {
      console.log(`  would resolve: ${p.id}  target=${p.target}`);
      continue;
    }
    try {
      const targetItem = await FeedItems.findOne({ id: p.target }).select("object").lean();
      const targetActor = targetItem?.object?.actor;
      if (!targetActor) {
        skipped++;
        console.log(`  skip: ${p.id}  (target not resolvable)`);
        continue;
      }
      await Post.updateOne({ id: p.id }, { $set: { targetActor } });
      await FeedItems.updateOne({ id: p.id }, { $set: { "object.targetActor": targetActor } });
      done++;
      console.log(`  ok: ${p.id} -> ${targetActor.id}`);
    } catch (err) {
      skipped++;
      console.log(`  error: ${p.id}  (${err.message})`);
    }
  }

  console.log(
    DRY_RUN
      ? `\nDry run: ${seen} candidate post(s).`
      : `\nDone: ${done} backfilled, ${skipped} skipped, ${seen} scanned.`
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
