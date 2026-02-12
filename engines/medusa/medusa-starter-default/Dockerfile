FROM node:20-alpine

WORKDIR /server

RUN apk add --no-cache libc6-compat

# ── Dependency layer (cached unless package.json changes) ──
COPY package.json package-lock.json* ./
RUN npm install --prefer-offline

# ── Source layer ──
COPY . .

# ── Build backend TypeScript only (admin served by Vite at runtime) ──
RUN npm run build

EXPOSE 9000

# On startup: migrate, sync, create admin (skip if exists), seed (skip if done), then start.
# medusa start in NODE_ENV=development uses Vite for admin UI.
CMD ["sh", "-c", "\
  npx medusa db:migrate && \
  npx medusa db:sync-links && \
  (npx medusa user -e \"$ADMIN_EMAIL\" -p \"$ADMIN_PASSWORD\" >/dev/null 2>&1 || true) && \
  (npm run seed 2>&1 || true) && \
  npx medusa start"]
  