FROM node:20-alpine

WORKDIR /server

RUN apk add --no-cache libc6-compat

# ── Dependency layer (cached unless package.json changes) ──
COPY package.json package-lock.json* ./
RUN npm install --prefer-offline

# ── Source layer ──
COPY . .

RUN npm run build \
    && mkdir -p public \
    && cp -r .medusa/server/public/admin public/admin \
    && mkdir -p uploads

EXPOSE 9000

# On startup: migrate, sync, create admin (skip if exists), seed (skip if done), then start.
CMD ["sh", "-c", "\
  npx medusa db:migrate && \
  npx medusa db:sync-links && \
  (npx medusa user -e \"$ADMIN_EMAIL\" -p \"$ADMIN_PASSWORD\" >/dev/null 2>&1 || true) && \
  (npm run seed 2>&1 || true) && \
  npx medusa start"]
  