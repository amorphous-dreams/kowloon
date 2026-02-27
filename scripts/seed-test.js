// scripts/seed-test.js
// Deterministic seed script that creates test data with every visibility permutation.
// Usage:
//   node scripts/seed-test.js              # seed only
//   node scripts/seed-test.js --wipe       # wipe all collections first, then seed
//   node scripts/seed-test.js --wipe-only  # wipe only, no seed

import "dotenv/config";
import Kowloon, { attachMethodDomains } from "#kowloon";
import initKowloon from "#methods/utils/init.js";
import * as Models from "#schema/index.js";
import createNotification from "#methods/notifications/create.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : isNaN(+v) ? v : +v];
  })
);

const RUN_ID = "test";

// ── helpers ──────────────────────────────────────────────────────────────────

const toMember = (u) => ({
  id: u.id,
  name: u.profile?.name || u.username,
  inbox: u.inbox,
  outbox: u.outbox,
  icon: u.profile?.icon || u.profile?.avatar || "",
  url: u.url,
  server: u.server || "",
});

const toActor = (u) => ({
  id: u.id,
  name: u.profile?.name || u.username,
  url: u.url,
  icon: u.profile?.icon || u.profile?.avatar || "",
  inbox: u.inbox,
  outbox: u.outbox,
});

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("→ Initializing Kowloon (DB + settings)...");
  await initKowloon(Kowloon, {
    domain: process.env.DOMAIN,
    siteTitle: process.env.SITE_TITLE || "Kowloon",
    adminEmail: process.env.ADMIN_EMAIL,
    smtpHost: process.env.SMTP_HOST,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  });
  await attachMethodDomains(Kowloon);

  const {
    Settings,
    User,
    Post,
    Reply,
    React,
    Bookmark,
    Group,
    Circle,
    Notification,
  } = Models;

  // ── Step 0: Optional wipe ─────────────────────────────────────────────────

  if (args.wipe || args["wipe-only"]) {
    console.log("→ Wiping test data (meta.runId='test')...");
    await Promise.all([
      Notification.deleteMany({ "meta.runId": RUN_ID }),
      React.deleteMany({ "meta.runId": RUN_ID }),
      Reply.deleteMany({ "meta.runId": RUN_ID }),
      Post.deleteMany({ "meta.runId": RUN_ID }),
      Bookmark.deleteMany({ "meta.runId": RUN_ID }),
      Group.deleteMany({ "meta.runId": RUN_ID }),
    ]);
    // Circles created by User pre-save don't have meta.runId,
    // so delete user-created circles first, then users (which cascade system circles)
    await Circle.deleteMany({ "meta.runId": RUN_ID });
    // Delete system circles owned by our test users
    const testUsers = await User.find({ "meta.runId": RUN_ID }).select("id circles").lean();
    if (testUsers.length > 0) {
      const systemCircleIds = testUsers.flatMap((u) =>
        Object.values(u.circles || {}).filter(Boolean)
      );
      if (systemCircleIds.length > 0) {
        await Circle.deleteMany({ id: { $in: systemCircleIds } });
      }
    }
    await User.deleteMany({ "meta.runId": RUN_ID });
    console.log("→ Wipe complete.");
    if (args["wipe-only"]) {
      process.exit(0);
    }
  }

  // ── Step 1: Read settings ─────────────────────────────────────────────────

  const settingsDocs = await Settings.find().lean();
  const settings = Object.fromEntries(
    settingsDocs.map((s) => [s.name, s.value])
  );
  const domain = (settings.domain || process.env.DOMAIN || "kwln.org").toLowerCase();

  let likeEmojis = settings.likeEmojis;
  if (!Array.isArray(likeEmojis) || likeEmojis.length === 0) {
    likeEmojis = [
      { name: "like", emoji: "👍" },
      { name: "love", emoji: "❤️" },
      { name: "laugh", emoji: "😂" },
    ];
    await Settings.findOneAndUpdate(
      { name: "likeEmojis" },
      { value: likeEmojis },
      { upsert: true }
    );
  }

  // ── Step 2: Create Users ──────────────────────────────────────────────────
  // 4 users, each with a different profile visibility

  console.log("→ Creating 4 users (password: testpass)...");

  const alice = await User.create({
    username: "alice",
    email: "alice@example.com",
    password: "testpass",
    profile: { name: "Alice Anderson", bio: "Public user for testing" },
    to: "@public",
    canReply: "@public",
    canReact: "@public",
    meta: { runId: RUN_ID },
  });

  const bob = await User.create({
    username: "bob",
    email: "bob@example.com",
    password: "testpass",
    profile: { name: "Bob Baker", bio: "Server-only user for testing" },
    to: `@${domain}`,
    canReply: `@${domain}`,
    canReact: `@${domain}`,
    meta: { runId: RUN_ID },
  });

  // Carol will be updated to circle-scoped after we create circles
  const carol = await User.create({
    username: "carol",
    email: "carol@example.com",
    password: "testpass",
    profile: { name: "Carol Chen", bio: "Circle-only user for testing" },
    to: "@public", // placeholder, updated in step 3
    canReply: "@public",
    canReact: "@public",
    meta: { runId: RUN_ID },
  });

  const dave = await User.create({
    username: "dave",
    email: "dave@example.com",
    password: "testpass",
    profile: { name: "Dave Davis", bio: "Private user for testing" },
    to: "", // placeholder, set after id is generated
    canReply: "",
    canReact: "",
    meta: { runId: RUN_ID },
  });
  // Dave's to/canReply/canReact = his own ID (private)
  dave.to = dave.id;
  dave.canReply = dave.id;
  dave.canReact = dave.id;
  await dave.save();

  const users = [alice, bob, carol, dave];
  console.log(`  Users: ${users.map((u) => `${u.username} (${u.to})`).join(", ")}`);

  // ── Step 3: Create user Circles (4 per user = 16) ─────────────────────────
  // Each user gets: public, server-only, circle-scoped, private

  console.log("→ Creating 4 circles per user (16 total)...");

  const userCircles = {}; // { alice: { public, server, circle, private }, ... }

  for (const u of users) {
    // Public circle
    const pub = await Circle.create({
      actorId: u.id,
      name: `${u.username}'s Public List`,
      summary: `Public circle owned by ${u.username}`,
      to: "@public",
      type: "Circle",
      meta: { runId: RUN_ID },
    });

    // Server-only circle
    const srv = await Circle.create({
      actorId: u.id,
      name: `${u.username}'s Server List`,
      summary: `Server-only circle owned by ${u.username}`,
      to: `@${domain}`,
      type: "Circle",
      meta: { runId: RUN_ID },
    });

    // Circle-scoped circle (visible only to members of user's Following circle)
    const cir = await Circle.create({
      actorId: u.id,
      name: `${u.username}'s Inner Circle`,
      summary: `Circle-scoped circle owned by ${u.username}`,
      to: u.circles.following, // visible to members of their Following
      type: "Circle",
      meta: { runId: RUN_ID },
    });

    // Private circle (visible only to creator)
    const prv = await Circle.create({
      actorId: u.id,
      name: `${u.username}'s Private List`,
      summary: `Private circle owned by ${u.username}`,
      to: u.id,
      type: "Circle",
      meta: { runId: RUN_ID },
    });

    userCircles[u.username] = { public: pub, server: srv, circle: cir, private: prv };
  }

  // Update Carol's profile visibility to her own circle-scoped circle
  carol.to = userCircles.carol.circle.id;
  carol.canReply = userCircles.carol.circle.id;
  carol.canReact = userCircles.carol.circle.id;
  await carol.save();

  console.log("  Created 16 user circles.");

  // ── Step 4: Cross-follow + populate circles ───────────────────────────────

  console.log("→ Wiring up circle memberships...");

  // Add all users to each other's Following circles (full mesh)
  for (const owner of users) {
    const others = users.filter((u) => u.id !== owner.id);
    for (const other of others) {
      const member = toMember(other);
      // Add to Following
      await Circle.updateOne(
        { id: owner.circles.following, "members.id": { $ne: other.id } },
        { $push: { members: member }, $inc: { memberCount: 1 } }
      );
      // Add to All Following
      await Circle.updateOne(
        { id: owner.circles.allFollowing, "members.id": { $ne: other.id } },
        { $push: { members: member }, $inc: { memberCount: 1 } }
      );
    }
  }

  // Populate user-created circles with some members
  // Alice's public circle: bob, carol
  for (const u of [bob, carol]) {
    await Circle.updateOne(
      { id: userCircles.alice.public.id, "members.id": { $ne: u.id } },
      { $push: { members: toMember(u) }, $inc: { memberCount: 1 } }
    );
  }
  // Bob's server circle: alice, dave
  for (const u of [alice, dave]) {
    await Circle.updateOne(
      { id: userCircles.bob.server.id, "members.id": { $ne: u.id } },
      { $push: { members: toMember(u) }, $inc: { memberCount: 1 } }
    );
  }
  // Carol's inner circle: alice
  await Circle.updateOne(
    { id: userCircles.carol.circle.id, "members.id": { $ne: alice.id } },
    { $push: { members: toMember(alice) }, $inc: { memberCount: 1 } }
  );
  // Dave's private circle: bob
  await Circle.updateOne(
    { id: userCircles.dave.private.id, "members.id": { $ne: bob.id } },
    { $push: { members: toMember(bob) }, $inc: { memberCount: 1 } }
  );

  console.log("  Cross-follows and circle memberships wired.");

  // ── Step 5: Create Groups (3 per alice & bob = 6) ─────────────────────────
  // Public, server-only, circle-scoped (no private groups)

  console.log("→ Creating 6 groups (3 per alice & bob)...");

  const groupData = [];

  for (const creator of [alice, bob]) {
    // Public open group
    const pubGroup = await Group.create({
      actorId: creator.id,
      name: `${creator.username}'s Public Group`,
      description: `Open group by ${creator.username}`,
      to: "@public",
      rsvpPolicy: "open",
      meta: { runId: RUN_ID },
    });
    groupData.push({ group: pubGroup, creator, visibility: "public" });

    // Server-only group
    const srvGroup = await Group.create({
      actorId: creator.id,
      name: `${creator.username}'s Server Group`,
      description: `Server-only group by ${creator.username}`,
      to: `@${domain}`,
      rsvpPolicy: "serverOpen",
      meta: { runId: RUN_ID },
    });
    groupData.push({ group: srvGroup, creator, visibility: "server" });

    // Circle-scoped group
    const cirGroup = await Group.create({
      actorId: creator.id,
      name: `${creator.username}'s Circle Group`,
      description: `Circle-scoped group by ${creator.username}`,
      to: userCircles[creator.username].public.id,
      rsvpPolicy: "approvalOnly",
      meta: { runId: RUN_ID },
    });
    groupData.push({ group: cirGroup, creator, visibility: "circle" });
  }

  // Add members to groups + update users' Groups circles
  const addToGroup = async (group, user) => {
    // Reload group to get circles
    const g = await Group.findOne({ id: group.id }).lean();
    if (!g?.circles?.members) return;

    // Add user to group's members circle
    await Circle.updateOne(
      { id: g.circles.members, "members.id": { $ne: user.id } },
      { $push: { members: toMember(user) }, $inc: { memberCount: 1 } }
    );

    // Add group to user's Groups system circle
    const groupMember = {
      id: g.id,
      name: g.name || "",
      icon: g.icon || "",
      url: g.url || "",
      inbox: g.inbox || "",
      outbox: g.outbox || "",
      server: g.server || "",
    };
    await Circle.updateOne(
      { id: user.circles.groups, "members.id": { $ne: g.id } },
      { $push: { members: groupMember }, $inc: { memberCount: 1 } }
    );
  };

  // Add bob and carol to alice's public group
  // Add alice and carol to bob's public group
  // Add dave to both server groups
  for (const { group, creator, visibility } of groupData) {
    const others = users.filter((u) => u.id !== creator.id);
    if (visibility === "public") {
      // Add all others
      for (const u of others) {
        await addToGroup(group, u);
      }
    } else if (visibility === "server") {
      // Add two others
      const toAdd = others.slice(0, 2);
      for (const u of toAdd) {
        await addToGroup(group, u);
      }
    } else if (visibility === "circle") {
      // Add one other
      await addToGroup(group, others[0]);
    }
  }

  console.log(`  Created ${groupData.length} groups with memberships.`);

  // ── Step 6: Create Posts (4 per user = 16) ────────────────────────────────
  // Each user creates one post at each visibility level

  console.log("→ Creating 16 posts (4 per user)...");

  const allPosts = [];

  for (const u of users) {
    const uc = userCircles[u.username];
    const actor = toActor(u);

    const visibilities = [
      {
        label: "public",
        to: "@public",
        canReply: "@public",
        canReact: "@public",
      },
      {
        label: "server",
        to: `@${domain}`,
        canReply: `@${domain}`,
        canReact: "@public",
      },
      {
        label: "circle",
        to: uc.public.id,
        canReply: uc.public.id,
        canReact: `@${domain}`,
      },
      {
        label: "private",
        to: u.id,
        canReply: u.id,
        canReact: u.id,
      },
    ];

    for (const vis of visibilities) {
      const post = await Post.create({
        actorId: u.id,
        actor,
        type: "Note",
        source: {
          mediaType: "text/markdown",
          content: `This is ${u.username}'s ${vis.label} post. Only visible to: ${vis.to}`,
        },
        summary: `${u.username}'s ${vis.label} note`,
        to: vis.to,
        canReply: vis.canReply,
        canReact: vis.canReact,
        tags: ["test", vis.label],
        meta: { runId: RUN_ID },
      });
      allPosts.push({ post, user: u, visibility: vis.label });
    }
  }

  console.log(`  Created ${allPosts.length} posts.`);

  // ── Step 7: Create Replies + Reacts ───────────────────────────────────────

  console.log("→ Creating replies and reacts...");

  const allReplies = [];
  const allReacts = [];

  // Bob replies to Alice's public post
  const alicePublicPost = allPosts.find(
    (p) => p.user.username === "alice" && p.visibility === "public"
  );
  if (alicePublicPost) {
    const r = await Reply.create({
      actorId: bob.id,
      actor: toActor(bob),
      target: alicePublicPost.post.id,
      targetActorId: alice.id,
      source: {
        mediaType: "text/markdown",
        content: "Nice public post, Alice!",
      },
      meta: { runId: RUN_ID },
    });
    allReplies.push(r);

    // Carol replies to Bob's reply (nested)
    const nested = await Reply.create({
      actorId: carol.id,
      actor: toActor(carol),
      target: alicePublicPost.post.id,
      parent: r.id,
      targetActorId: alice.id,
      source: {
        mediaType: "text/markdown",
        content: "I agree with Bob!",
      },
      meta: { runId: RUN_ID },
    });
    allReplies.push(nested);
  }

  // Carol replies to Bob's server post
  const bobServerPost = allPosts.find(
    (p) => p.user.username === "bob" && p.visibility === "server"
  );
  if (bobServerPost) {
    const r = await Reply.create({
      actorId: carol.id,
      actor: toActor(carol),
      target: bobServerPost.post.id,
      targetActorId: bob.id,
      source: {
        mediaType: "text/markdown",
        content: "Server-only reply from Carol.",
      },
      meta: { runId: RUN_ID },
    });
    allReplies.push(r);
  }

  // Reacts: each user reacts to another user's public post
  const publicPosts = allPosts.filter((p) => p.visibility === "public");
  for (let i = 0; i < publicPosts.length; i++) {
    const reactor = users[(i + 1) % users.length]; // next user reacts
    const target = publicPosts[i];
    const emoji = likeEmojis[i % likeEmojis.length];
    const rx = await React.create({
      actorId: reactor.id,
      target: target.post.id,
      name: emoji.name,
      emoji: emoji.emoji,
      meta: { runId: RUN_ID },
    });
    allReacts.push(rx);
  }

  console.log(`  Created ${allReplies.length} replies, ${allReacts.length} reacts.`);

  // ── Step 8: Create Bookmarks (4 per user = 16 + 1 folder) ────────────────

  console.log("→ Creating bookmarks...");

  const allBookmarks = [];

  // One folder for alice
  const folder = await Bookmark.create({
    type: "Folder",
    ownerId: alice.id,
    ownerType: "User",
    actorId: alice.id,
    title: "Alice's Test Folder",
    to: "@public",
    meta: { runId: RUN_ID },
  });
  allBookmarks.push(folder);

  for (const u of users) {
    const uc = userCircles[u.username];

    const visibilities = [
      { label: "public", to: "@public" },
      { label: "server", to: `@${domain}` },
      { label: "circle", to: uc.public.id },
      { label: "private", to: u.id },
    ];

    for (const vis of visibilities) {
      const bk = await Bookmark.create({
        type: "Bookmark",
        ownerId: u.id,
        ownerType: "User",
        actorId: u.id,
        title: `${u.username}'s ${vis.label} bookmark`,
        href: `https://example.com/${u.username}/${vis.label}`,
        description: `A ${vis.label} bookmark by ${u.username}`,
        to: vis.to,
        tags: ["test", vis.label],
        parentFolder: u.username === "alice" && vis.label === "public" ? folder.id : undefined,
        meta: { runId: RUN_ID },
      });
      allBookmarks.push(bk);
    }
  }

  console.log(`  Created ${allBookmarks.length} bookmarks (including 1 folder).`);

  // ── Step 9: Create Notifications ──────────────────────────────────────────

  console.log("→ Creating notifications for alice...");

  const notifications = [];

  // Reply notification
  if (alicePublicPost) {
    const n = await createNotification({
      type: "reply",
      recipientId: alice.id,
      actorId: bob.id,
      objectId: allReplies[0]?.id,
      objectType: "Reply",
    });
    if (n) notifications.push(n);
  }

  // React notification
  const aliceReact = allReacts.find(
    (rx) => allPosts.find((p) => p.post.id === rx.target)?.user?.username === "alice"
  );
  if (aliceReact) {
    const n = await createNotification({
      type: "react",
      recipientId: alice.id,
      actorId: aliceReact.actorId,
      objectId: aliceReact.target,
      objectType: "Post",
    });
    if (n) notifications.push(n);
  }

  // Follow notification (bob followed alice)
  const n3 = await createNotification({
    type: "follow",
    recipientId: alice.id,
    actorId: bob.id,
  });
  if (n3) notifications.push(n3);

  // Join request notification (carol wants to join alice's circle group)
  const aliceCircleGroup = groupData.find(
    (g) => g.creator.username === "alice" && g.visibility === "circle"
  );
  if (aliceCircleGroup) {
    const n = await createNotification({
      type: "join_request",
      recipientId: alice.id,
      actorId: carol.id,
      objectId: aliceCircleGroup.group.id,
      objectType: "Group",
    });
    if (n) notifications.push(n);
  }

  console.log(`  Created ${notifications.length} notifications.`);

  // ── Step 10: Summary ──────────────────────────────────────────────────────

  console.log("\n=== Seed Complete ===");
  console.table({
    "Run ID": RUN_ID,
    Users: users.length,
    "User Circles": Object.keys(userCircles).length * 4,
    "System Circles": "auto (5 per user)",
    Groups: groupData.length,
    Posts: allPosts.length,
    Replies: allReplies.length,
    Reacts: allReacts.length,
    Bookmarks: allBookmarks.length,
    Notifications: notifications.length,
  });

  console.log("\n--- Users ---");
  for (const u of users) {
    console.log(`  ${u.username}: id=${u.id}, to=${u.to}`);
  }

  console.log("\n--- User Circles ---");
  for (const [username, cs] of Object.entries(userCircles)) {
    for (const [vis, c] of Object.entries(cs)) {
      console.log(`  ${username}/${vis}: id=${c.id}, to=${c.to}`);
    }
  }

  console.log("\n--- Groups ---");
  for (const { group, creator, visibility } of groupData) {
    console.log(`  ${creator.username}/${visibility}: id=${group.id}, to=${group.to}`);
  }

  console.log("\nAll passwords: testpass");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
