# Kowloon — Server

Federated social media server. Node.js, Express, MongoDB/Mongoose, ActivityPub-compatible.

## Architecture

### Core Concept: Circles Replace the Social Graph

Kowloon has **no follow/unfollow system**. Instead, users organize people into **Circles** (like contact lists). Adding someone to a circle IS the follow. There are no followers/following counts, no social graph edges.

- **System Circles** (`type: "System"`): Auto-created per user, addressed `to` the user's own ID. All start empty.
  - **Following**: People the user actively reads content from
  - **All Following**: Superset including followed servers and groups
  - **Groups**: Tracks which Groups the user belongs to (members are Group objects, not Users)
  - **Blocked**: Blocked users
  - **Muted**: Muted users
- **User Circles** (`type: "Circle"`): User-created lists (e.g., "Close Friends", "Work")
- **Group Circles** (`type: "System"`): Each Group gets 5 system circles: Admins, Moderators, Members, Blocked, Pending

### Addressing Model

Every object has a `to` field controlling visibility:
- `@public` — visible to everyone, federated
- `@<domain>` (e.g., `@kwln.org`) — server members only
- `<circleId>` — only members of that circle
- `<userId>` — only that user (private/self-only)

Posts also have `canReply` and `canReact` with the same addressing format.

### Object Types

- **User**: `id` = `@username@domain`, `actorId` = `https://domain/users/username`
- **Post**: Types: Note, Article, Link, Media, Event. `id` = `post:<mongoId>@domain`
- **Reply**: Separate model (not a Post). `id` = `reply:<mongoId>@domain`, `target` points to parent
- **React**: `id` = `react:<mongoId>@domain`, `target` points to reacted object, has `emoji` + `name`
- **Circle**: `id` = `circle:<mongoId>@domain`
- **Group**: `id` = `group:<mongoId>@domain`. Has `rsvpPolicy`: open, serverOpen, serverApproval, approvalOnly
- **Bookmark**: `id` = `bookmark:<mongoId>@domain`. Types: Bookmark (has `href` or `target`), Folder (has `parentId`)
- **Page**: `id` = `page:<mongoId>@domain`. Admin-created content pages
- **Notification**: `id` = `notification:<mongoId>@domain`. Types: reply, react, follow, new_post, join_request, join_approved

### Member Subdocument

Generic embedded doc used in Circle.members[]: `{ id, name, inbox, outbox, icon, url, server, lastFetchedAt }`

Works for both User and Group references (e.g., in the Groups system circle, members are Group objects).

## Key Patterns

### Route Wrapper (`routes/utils/route.js`)

All route handlers use: `route(async ({ req, query, params, body, user, set, setStatus }) => { ... })`

- `set(key, value)` — takes TWO arguments, sets response fields
- `setStatus(code)` — sets HTTP status
- `user` — authenticated user from JWT (null if unauthenticated)
- GET/HEAD/OPTIONS are unauthenticated by default; POST requires auth
- Override with `{ allowUnauth: true }` or `{ allowUnauth: false }`

### Collection Helper (`routes/utils/makeCollection.js`)

Factory for paginated list endpoints: `makeCollection({ model, buildQuery, select, sort, sanitize, ... })`

Returns ActivityStreams OrderedCollection responses.

### ActivityParser Pipeline

`POST /outbox` -> Activity validation -> ActivityParser -> handler (Create, Reply, React, Join, Add, Leave, etc.)

Handlers do: validation, model creation, circle/group membership updates, notifications, federation.

**Important**: Direct `Model.create()` skips: `actor` embed population, feed fan-out, notifications, federation. The `actor` field on Posts must be set manually if creating directly.

### Visibility System (`methods/visibility/`)

- `getViewerContext(userId)` — returns user's circles, groups, blocked lists
- `canSeeObject(object, viewerContext)` — checks if user can see an object based on `to` field
- `buildVisibilityQuery(viewerContext)` — MongoDB query filter for visible objects
- `sanitizeObject(doc)` — strips sensitive fields for API responses

### Settings Cache (`methods/settings/cache.js`)

In-memory Map loaded from Settings collection. Must call `loadSettings()` or `initKowloon()` before use. `getSetting(name)` reads from cache. Schema hooks use `getServerSettings()` which falls back to env vars if cache isn't loaded yet.

## File Structure

```
schema/           — Mongoose models (User, Post, Circle, Group, etc.)
schema/subschema/ — Embedded schemas (Member, Profile, GeoPoint)
routes/           — Express routers, auto-mounted by routes/index.js
routes/utils/     — route(), makeCollection(), makeGetById(), oc.js
methods/          — Business logic organized by domain
ActivityParser/   — Activity processing pipeline
  handlers/       — One handler per activity type (Create, Reply, React, Join, etc.)
workers/          — Background job processors (feedFanOut)
scripts/          — CLI tools (seed.js, seed-test.js, wipe.js)
config/           — Default settings
```

### Route Auto-Mounting

`routes/index.js` scans for subdirectories with `index.js` files. Each directory becomes a route prefix (e.g., `routes/posts/index.js` -> `/posts`). Special cases: `home` -> `/`, `well-known` -> `/.well-known`.

## Schema Imports

```js
import { Post } from "#schema";           // named export
import User from "#schema/User.js";       // or default exports
import * as Models from "#schema/index.js"; // all models
```

The `#schema`, `#methods`, `#kowloon` path aliases are defined in package.json imports.

## Database

MongoDB via Mongoose. Connection URI from env: `MONGO_URI` (or `MONGODB_URI`, `MONGO_URL`, `DATABASE_URL`).

### Testing

- `scripts/seed-test.js` — Deterministic seed: 4 users (alice/bob/carol/dave) with every visibility permutation for circles, groups, posts, bookmarks. Password: `testpass`. Tagged with `meta.runId: "test"`.
- `scripts/seed-test.js --wipe` — Wipe test data then re-seed
- `scripts/seed.js` — Random seed with faker (configurable counts)
- `POST /__test/wipe` — Wipes all collections except settings (non-production only)

## Current State

### Working
- User registration + auth (JWT)
- All CRUD via outbox + ActivityParser
- Circle/Group management (create, join, leave, add, remove)
- Notifications (create, list, read, unread, dismiss)
- File uploads (S3/MinIO)
- Federation basics (inbox/outbox, HTTP signatures)
- All GET API routes (posts, users, circles, groups, bookmarks, search, notifications)
- Convenience `/notifications` route (resolves user from JWT)

### TODO
- Admin API routes (`/admin/*`)
- Client library testing against seeded data
- Feed fan-out / timeline assembly testing
- Full federation testing (S2S)
- Event type (RSVP system)

## Joplin Integration

Notes are stored in Joplin via Web Clipper API for design docs and specs.
- Port: 41184 (localhost)
- Token: set in env var `JOPLIN_TOKEN`
- Kowloon folder ID: 112f3b6f046a4664ad4733477953ceb4
- Consolidated Client API spec note ID: 1cfd6eaee9b64494a577617d4f9e5847

To read a note: `curl "http://localhost:41184/notes/<id>?token=$JOPLIN_TOKEN&fields=body"`
To list notes in folder: `curl "http://localhost:41184/folders/<folderId>/notes?token=$JOPLIN_TOKEN&fields=id,title"`
