FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/landing/package.json apps/landing/package.json
RUN pnpm install --frozen-lockfile --filter @scopeprofit/landing
COPY apps/landing apps/landing
RUN pnpm --filter @scopeprofit/landing run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/landing/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=build --chown=node:node /app/apps/landing/public ./apps/landing/public
USER node
EXPOSE 3000
CMD ["node", "apps/landing/server.js"]
