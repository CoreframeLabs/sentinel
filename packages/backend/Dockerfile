# Build from the repository root:
#   docker build -f packages/backend/Dockerfile .
# (Railway: set the Dockerfile path to packages/backend/Dockerfile with the
# repo root as build context.)

FROM node:22-slim AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/package.json

FROM base AS build
RUN npm ci --workspace=packages/backend
COPY packages/backend/tsconfig.json packages/backend/tsconfig.build.json packages/backend/
COPY packages/backend/src packages/backend/src
RUN npm run build --workspace=packages/backend

FROM base AS prod-deps
RUN npm ci --omit=dev --workspace=packages/backend

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY --from=build /app/packages/backend/dist packages/backend/dist
COPY packages/backend/migrations packages/backend/migrations

USER node
EXPOSE 3000
WORKDIR /app/packages/backend
# Migrations run before the server starts; the server itself fails closed if
# the database is unreachable.
CMD ["sh", "-c", "npm run migrate:up && node dist/index.js"]
