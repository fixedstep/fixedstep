# Build context: repository root.
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@10.34.7
COPY . .
RUN pnpm install --frozen-lockfile --filter @fixedstep/grader...
RUN pnpm --filter @fixedstep/grader build
# quickjs-emscripten stays external (it loads its .wasm from its package files), so install it
# next to server.js at exactly the version the lockfile resolved.
RUN QJS=$(node -p "require('/repo/packages/test-harness/node_modules/quickjs-emscripten/package.json').version") \
 && mkdir /out && cp -r apps/grader/dist/. /out/ \
 && cd /out && npm install --omit=dev --no-save --no-package-lock --no-audit --no-fund "quickjs-emscripten@${QJS}"

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
COPY --from=build /out ./
USER node
EXPOSE 3001
CMD ["node", "--enable-source-maps", "server.js"]
