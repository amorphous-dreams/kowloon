import "dotenv/config";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { Settings, User, Invite, Circle } from "#schema";
import toMember from "#methods/parse/toMember.js";

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error("sanitize-qa-after-sync: missing Mongo URI");
  process.exit(1);
}

const qaDomain = process.env.DOMAIN;
const qaOperatorEmail = process.env.QA_OPERATOR_EMAIL || process.env.ADMIN_EMAIL;
const qaOperatorPassword =
  process.env.QA_OPERATOR_PASSWORD || process.env.ADMIN_PASSWORD;
const qaOperatorUsername = process.env.QA_OPERATOR_USERNAME || "qaadmin";

if (!qaDomain || !qaOperatorEmail || !qaOperatorPassword) {
  console.error(
    "sanitize-qa-after-sync: missing DOMAIN/QA_OPERATOR_EMAIL/QA_OPERATOR_PASSWORD"
  );
  process.exit(1);
}

function profileForDomain(existingProfile, domain) {
  const profile = existingProfile && typeof existingProfile === "object" ? existingProfile : {};
  const urls = Array.isArray(profile.urls) ? profile.urls : [];
  const nonHttp = urls.filter((u) => typeof u === "string" && !u.startsWith("http"));
  return {
    ...profile,
    urls: [`https://${domain}`, ...nonHttp],
  };
}

async function upsertSetting(name, value) {
  await Settings.updateOne({ name }, { $set: { value } }, { upsert: true });
}

async function redactUserEmails() {
  const usersWithEmail = await User.find({
    email: { $exists: true, $ne: null, $ne: "" },
  })
    .select("_id email")
    .lean();

  for (const u of usersWithEmail) {
    await User.updateOne(
      { _id: u._id },
      { $set: { email: `redacted+${String(u._id)}@qa.invalid` } }
    );
  }
}

async function rotateServerKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  await upsertSetting("publicKey", publicKey);
  await upsertSetting("privateKey", privateKey);
}

async function normalizeServerIdentity() {
  const profileDoc = await Settings.findOne({ name: "profile" }).lean();
  const profile = profileForDomain(profileDoc?.value, qaDomain);

  await upsertSetting("domain", qaDomain);
  await upsertSetting("actorId", `@${qaDomain}`);
  await upsertSetting("profile", profile);
  await upsertSetting("adminEmail", qaOperatorEmail);
  await upsertSetting("emailServer", {
    protocol: "smtp",
    host: "localhost",
    username: "qa-redacted",
    password: "qa-redacted",
  });
}

async function ensureQaOperator() {
  let operator = await User.findOne({ email: qaOperatorEmail });

  if (!operator) {
    let username = qaOperatorUsername;
    let i = 1;
    while (await User.exists({ username })) {
      username = `${qaOperatorUsername}${i}`;
      i += 1;
    }

    operator = await User.create({
      username,
      password: qaOperatorPassword,
      email: qaOperatorEmail,
      profile: { name: "QA Operator" },
      active: true,
    });
  } else {
    operator.password = qaOperatorPassword;
    operator.active = true;
    await operator.save();
  }

  const adminCircleSetting = await Settings.findOne({ name: "adminCircle" }).lean();
  const modCircleSetting = await Settings.findOne({ name: "modCircle" }).lean();
  const member = toMember(operator);

  if (adminCircleSetting?.value) {
    await Circle.updateOne(
      { id: adminCircleSetting.value },
      { $addToSet: { members: member } }
    );
  }
  if (modCircleSetting?.value) {
    await Circle.updateOne(
      { id: modCircleSetting.value },
      { $addToSet: { members: member } }
    );
  }
}

async function main() {
  await mongoose.connect(MONGO_URI);
  try {
    await redactUserEmails();
    await Invite.deleteMany({});
    await rotateServerKeys();
    await normalizeServerIdentity();
    await ensureQaOperator();
    console.log("sanitize-qa-after-sync: completed");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("sanitize-qa-after-sync: fatal error", err);
  process.exit(1);
});
