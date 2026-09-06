FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @scopeprofit/api --filter @scopeprofit/contracts
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY scripts scripts
RUN pnpm --filter @scopeprofit/contracts run build && pnpm --filter @scopeprofit/api run db:generate && pnpm --filter @scopeprofit/api run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /data/storage && chown -R node:node /data/storage
USER node
EXPOSE 3001
CMD ["pnpm", "--filter", "@scopeprofit/api", "run", "start"]
