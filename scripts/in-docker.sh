#!/usr/bin/env sh
# Run a command with the repo's Node/pnpm toolchain in the compose dev image, as your user,
# on the compose network (DATABASE_URL points at the compose Postgres).
#   scripts/in-docker.sh pnpm test
#   scripts/in-docker.sh pnpm content:sync
set -eu
cd "$(dirname "$0")/.."
# `env` rather than assignment: UID is a read-only variable when sh is bash.
exec env UID="$(id -u)" GID="$(id -g)" docker compose run --rm --no-deps $( [ -t 0 ] || echo -T ) api "$@"
