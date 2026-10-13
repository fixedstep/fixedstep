#!/usr/bin/env sh
# Run a command with the repo's Node/pnpm toolchain inside Docker, as the current user.
# Useful when Node isn't installed (or isn't reachable) on the host.
#   scripts/in-docker.sh pnpm test
#   scripts/in-docker.sh pnpm content:sync
# Uses host networking so DATABASE_URL=localhost:5432 reaches the compose Postgres.
set -eu
cd "$(dirname "$0")/.."
PNPM_VERSION=$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' package.json)
NODE_MAJOR=$(cat .nvmrc)
mkdir -p .cache/docker-home
exec docker run --rm -i $( [ -t 0 ] && echo -t ) \
  -u "$(id -u):$(id -g)" \
  --network host \
  -e HOME=/app/.cache/docker-home \
  -v "$PWD":/app -w /app \
  "node:${NODE_MAJOR}" \
  sh -c "mkdir -p \$HOME/bin && [ -x \$HOME/bin/pnpm ] || npm install -g --silent --prefix \$HOME pnpm@${PNPM_VERSION} >/dev/null; export PATH=\$HOME/bin:\$PATH; exec \"\$@\"" -- "$@"
