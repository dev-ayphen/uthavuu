# Built from the monorepo root (see docker-compose.yml's `context: .`).
#
# apps/api DOES have a cross-workspace dependency now — `@uthavu/libs-common`,
# the shared error-code and admin-RBAC contract — and the pnpm lockfile is
# workspace-wide, so `pnpm install` needs every package.json in the workspace to
# resolve it. This file said "no cross-workspace dependency today" until that
# stopped being true, and the build then failed with TS2307 "Cannot find module
# '@uthavu/libs-common'" because the package was never copied in.
#
# ADDING ANOTHER `workspace:*` DEPENDENCY TO apps/api? It needs three lines
# here: its package.json before `pnpm install`, its source before the build, and
# its build output into the runtime stage. libs-common ships from `dist/`
# (its package `main`), which is gitignored — so the image must BUILD it rather
# than copy a directory that does not exist in a clean checkout.

FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
# The WHOLE package, not just its package.json like the others above, because
# libs-common declares a `prepare` script (`tsc -p tsconfig.json`) and pnpm runs
# `prepare` for workspace packages during `pnpm install`. With only the manifest
# copied, that ran before its tsconfig and src existed and install died with
# TS5058 "The specified path does not exist: 'tsconfig.json'".
#
# The cost is layer caching: editing libs-common source now invalidates the
# install layer. It is a handful of dependency-free files, and a correct build
# beats a fast broken one.
COPY libs-common libs-common
RUN pnpm install --frozen-lockfile

# `prepare` has already produced dist/ during install; this makes the build
# explicit and fails loudly here rather than at the API's first import.
RUN pnpm --filter @uthavu/libs-common build

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
# Needed at RUNTIME, not just to compile: the API imports real values from this
# package (the error codes in config/maintenance-mode.ts among them), not just
# types. The node_modules entry copied above is a symlink into here.
COPY --from=builder /repo/libs-common/dist ./libs-common/dist
COPY --from=builder /repo/libs-common/package.json ./libs-common/package.json
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml

WORKDIR /repo/apps/api
EXPOSE 3001

# Applies any pending migration before the server starts — see
# docs/decisions/0008-local-disk-photo-storage.md for why UPLOADS_DIR (default
# ./uploads, relative to this WORKDIR) is a mounted volume, not baked into the
# image.
CMD ["sh", "-c", "pnpm db:migrate && node dist/src/main.js"]
