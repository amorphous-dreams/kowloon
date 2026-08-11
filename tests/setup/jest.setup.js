import "dotenv/config";
import mongoose from "mongoose";
import http from "node:http";
import { buildApp } from "../helpers/app.js";
import init from "#methods/utils/init.js";

let server;

beforeAll(async () => {
  // Only setup once globally
  if (global.__TEST_SETUP_COMPLETE__) {
    return;
  }

  const baseUri = process.env.MONGO_URI || "mongodb://localhost:27017/kowloon";
  const uri = baseUri.replace(/\/(\w+)(\?|$)/, "/kowloon_test$2");

  // Only connect if not already connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // Wipe the test DB before seeding
  await mongoose.connection.dropDatabase();

  // Bootstrap Settings (RSA keypair, adminCircle/modCircle, etc.) — without
  // this, JWT signing has no privateKey and every login 401s. buildApp() only
  // mounts routes; it never called init(), so the whole integration suite was
  // silently unable to authenticate (found 2026-08-10/11 while verifying the
  // block/mute + interaction-authorization fixes).
  await init({}, { domain: process.env.DOMAIN || "kwln.org" });

  // Minimal Settings for pre-save hooks
  const { User } = await import("#schema");

  // Create admin user for tests. Pass the PLAIN password — UserSchema's
  // pre("save") hook (schema/User.js) already hashes it on create via
  // isModified("password"); pre-hashing here double-hashed it, so bcrypt.
  // compare in the login route always failed ("Invalid credentials") no
  // matter what was typed. Same root-cause class as the RSA-key gap above:
  // this whole suite couldn't authenticate at all until both were fixed.
  await User.create({
    id: "@admin@kwln.org",
    username: "admin",
    email: "admin@kwln.org",
    password: "adminpass",
    profile: { name: "Admin" },
  });

  const app = await buildApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  global.__TEST_BASE_URL__ = `http://127.0.0.1:${server.address().port}`;
  global.__TEST_SETUP_COMPLETE__ = true;
  global.__TEST_SERVER__ = server;
}, 60000);

afterAll(async () => {
  if (global.__TEST_SETUP_COMPLETE__) {
    await mongoose.disconnect();
    if (global.__TEST_SERVER__) {
      await new Promise((resolve) => global.__TEST_SERVER__.close(resolve));
    }
    global.__TEST_SETUP_COMPLETE__ = false;
  }
});
