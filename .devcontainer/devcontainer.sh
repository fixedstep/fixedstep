#!/usr/bin/env bash
# Drive the sandboxed dev container from the host with the devcontainer CLI.
#   .devcontainer/devcontainer.sh up             build (first time) and start postgres + dev
#   .devcontainer/devcontainer.sh shell          zsh inside the container
#   .devcontainer/devcontainer.sh claude [args]  Claude Code inside it (starts it first if needed)
#   .devcontainer/devcontainer.sh stop           stop, keep containers and volumes
#   .devcontainer/devcontainer.sh down           remove containers (volumes stay)
#   .devcontainer/devcontainer.sh rebuild        after changing .devcontainer/ (cached layers)
#   .devcontainer/devcontainer.sh rebuild-clean  from scratch: picks up a new Claude Code
set -euo pipefail
# From the repo root: docker-compose.yml mounts the workspace at ${PWD}.
cd "$(dirname "$0")/.."
# buildx bake otherwise refuses to read the CLI's generated Dockerfile from /tmp.
export BUILDX_BAKE_ENTITLEMENTS_FS=0
WS=(--workspace-folder "$PWD")
COMPOSE=(docker compose -f .devcontainer/docker-compose.yml)
# Every session drops the firewall's capabilities from its inheritable and bounding sets, so
# nothing it starts can get them back. Absolute path: the image is read-only.
DROP=(/usr/bin/setpriv --inh-caps=-net_admin,-net_raw --bounding-set=-net_admin,-net_raw --)

cmd=${1:-}
shift || true
case "$cmd" in
  up) devcontainer up "${WS[@]}" ;;
  shell) devcontainer exec "${WS[@]}" "${DROP[@]}" zsh ;;
  claude)
    devcontainer up "${WS[@]}" >/dev/null
    devcontainer exec "${WS[@]}" "${DROP[@]}" claude "$@"
    ;;
  stop) "${COMPOSE[@]}" stop ;;
  down) "${COMPOSE[@]}" down ;;
  rebuild) devcontainer up "${WS[@]}" --remove-existing-container ;;
  rebuild-clean) devcontainer up "${WS[@]}" --remove-existing-container --build-no-cache ;;
  *)
    sed -n '2,9p' "$0" >&2
    exit 1
    ;;
esac
