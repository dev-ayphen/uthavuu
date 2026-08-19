# Built from the monorepo root (see docker-compose.yml's `context: .`) — apps/api
# has no cross-workspace dependency today, but the pnpm lockfile is workspace-wide,
# so `pnpm install` needs every package.json in the workspace to resolve it.

FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter @uthavu/api build

FROM node:20-alpine AS runtime
RUN corepack enable
WORKDIR /repo
# NODE_ENV is deliberately NOT set here — it's supplied per-environment via
# docker-compose (unset for local dev, so ADR 0007's console OTP fallback can
# still run; a real deploy sets NODE_ENV=production, which is exactly what
# hard-blocks that fallback in auth.ts once real msg91 credentials exist).

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/drizzle ./apps/api/drizzle
COPY --from=builder /repo/apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml

WORKDIR /repo/apps/api
EXPOSE 3001

# Applies any pending migration before the server starts — see
# docs/decisions/0008-local-disk-photo-storage.md for why UPLOADS_DIR (default
# ./uploads, relative to this WORKDIR) is a mounted volume, not baked into the
# image.
CMD ["sh", "-c", "pnpm db:migrate && node dist/src/main.js"]
