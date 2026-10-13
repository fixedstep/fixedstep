# Dev toolchain image: Node + pnpm. Source is bind-mounted, not copied.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}
ARG PNPM_VERSION=10.34.7
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /app
