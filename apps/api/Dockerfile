# Build context: repository root (see infra/lib/app-stack.ts).
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@10.34.7
COPY . .
# Only the API and its workspace dependencies (skips CDK, Vite, etc.).
RUN pnpm install --frozen-lockfile --filter @fixedstep/api...
RUN pnpm --filter @fixedstep/api build
# The bundle keeps quickjs-emscripten external (it loads its .wasm from its own package files),
# so install it next to server.js, at exactly the version the lockfile resolved.
RUN QJS=$(node -p "require('/repo/packages/test-harness/node_modules/quickjs-emscripten/package.json').version") \
 && mkdir /out && cp -r apps/api/dist/. /out/ \
 && cd /out && npm install --omit=dev --no-save --no-package-lock --no-audit --no-fund "quickjs-emscripten@${QJS}"

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/drizzle \
    PORT=3000
COPY --from=build /out ./
COPY --from=build /repo/packages/db/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "server.js"]
