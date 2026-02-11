FROM node:20-alpine

WORKDIR /server

RUN apk add --no-cache libc6-compat

COPY package.json ./
COPY package-lock.json* ./

RUN npm install

COPY . .

# Build Medusa (TypeScript -> dist)
RUN npm run build

ENV NODE_ENV=production
EXPOSE 9000

# On startup: migrate DB, sync links, create admin user, seed demo data, then start.
# User creation & seeding are best-effort (|| true) — they fail harmlessly on re-runs.
CMD ["sh", "-c", "\
  npx medusa db:migrate && \
  npx medusa db:sync-links && \
  (npx medusa user -e \"$ADMIN_EMAIL\" -p \"$ADMIN_PASSWORD\" 2>&1 || true) && \
  (npm run seed 2>&1 || true) && \
  npm run start"]
