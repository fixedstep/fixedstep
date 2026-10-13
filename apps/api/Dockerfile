# Build context: repository root (see infra/lib/api-stack.ts).
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@10.34.7
COPY . .
# Only the API and its workspace dependencies (skips CDK, Vite, etc.).
RUN pnpm install --frozen-lockfile --filter @fixedstep/api...
RUN pnpm --filter @fixedstep/api build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/drizzle \
    PORT=3000
COPY --from=build /repo/apps/api/dist ./
COPY --from=build /repo/packages/db/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "server.js"]
