FROM node:22-slim

WORKDIR /app

# mongodump/mongorestore (MongoDB Database Tools) — required by the async
# backup/restore worker (workers/backup.js, see methods/backup/index.js).
# No official musl/Alpine build exists upstream, hence node:22-slim (Debian
# bookworm, glibc) instead of -alpine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates tar \
  && curl -fsSL https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-100.13.0.tgz -o /tmp/mongo-tools.tgz \
  && tar -xzf /tmp/mongo-tools.tgz -C /tmp \
  && mv /tmp/mongodb-database-tools-debian12-x86_64-100.13.0/bin/* /usr/local/bin/ \
  && rm -rf /tmp/mongo-tools.tgz /tmp/mongodb-database-tools-debian12-x86_64-100.13.0 \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Install deps into the image layer.
# Source code is bind-mounted at runtime via docker-compose volume.
# The named volume at /app/node_modules takes precedence over the bind mount,
# so the host's node_modules is never used inside the container.
COPY package.json package-lock.json* ./
RUN npm install

EXPOSE 3000

CMD ["node", "index.js"]
