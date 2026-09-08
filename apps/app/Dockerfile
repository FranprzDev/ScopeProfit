FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/app/package.json apps/app/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @scopeprofit/app --filter @scopeprofit/contracts
COPY packages/contracts packages/contracts
COPY apps/app apps/app
RUN pnpm --filter @scopeprofit/contracts run build && pnpm --filter @scopeprofit/app run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3002 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/app/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=build --chown=node:node /app/apps/app/public ./apps/app/public
USER node
EXPOSE 3002
CMD ["node", "apps/app/server.js"]
