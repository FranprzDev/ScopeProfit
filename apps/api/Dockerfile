FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace @scopeprofit/api --workspace @scopeprofit/contracts --include-workspace-root
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY scripts scripts
RUN npm run build -w @scopeprofit/contracts && npm run db:generate -w @scopeprofit/api && npm run build -w @scopeprofit/api

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /data/storage && chown -R node:node /data/storage
USER node
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@scopeprofit/api"]
