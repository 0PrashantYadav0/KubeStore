FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat && corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

RUN yarn install --immutable

COPY . .

# Build-time: skip env check + provide dummy key (real key injected at runtime via K8s env)
ENV NODE_ENV=production
ENV SKIP_ENV_CHECK=true
ENV NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_build_placeholder

RUN yarn build

# --- Production image (standalone output) ---
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

# Copy standalone server + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
EXPOSE 8000

CMD ["node", "server.js"]
