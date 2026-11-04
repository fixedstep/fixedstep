# Dev container

A sandboxed dev environment: Node 24, pnpm, Playwright's Chromium, Claude Code, and Postgres 17 as a sibling compose service. Outbound network is locked down by `init-firewall.sh` (GitHub, the npm registry, Anthropic, nothing else).

It runs on **rootless Docker** and is driven by the **devcontainer CLI**, no editor required.

## One-time host setup (CachyOS / Arch)

### 1. Install Docker, the rootless extras and the devcontainer CLI

```sh
sudo pacman -S docker docker-compose docker-buildx
paru -S docker-rootless-extras        # AUR (or yay)
pnpm add -g @devcontainers/cli
```

### 2. Turn off the rootful daemon

If system Docker was ever enabled, stop it so nothing uses `/var/run/docker.sock`:

```sh
sudo systemctl disable --now docker.socket docker.service
sudo rm -f /var/run/docker.sock
```

`Disabling 'docker.service', but its triggering units are still active: docker.socket` is only a warning. Check with `systemctl is-active docker.socket docker.service`; both should say `inactive`.

### 3. Give your user subordinate UID/GID ranges

```sh
grep "^$USER:" /etc/subuid /etc/subgid
# if nothing printed:
echo "$USER:231072:65536" | sudo tee -a /etc/subuid /etc/subgid
```

### 4. Load the kernel modules the container firewall needs

A rootless container can't load kernel modules, so `ipset`/`iptables` inside it fail unless the host has already loaded them:

```sh
printf 'ip_set\nip_set_hash_net\nnf_tables\n' | sudo tee /etc/modules-load.d/devcontainer-firewall.conf
sudo systemctl restart systemd-modules-load
```

### 5. Start the rootless daemon and point the CLI at it

```sh
systemctl --user enable --now docker.socket
sudo loginctl enable-linger "$USER"   # keep it running when you're logged out
docker context use rootless           # created by the rootless package; or set DOCKER_HOST below
```

If there's no `rootless` context, add this to your shell rc instead:

```sh
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
```

Check: `docker info --format '{{.SecurityOptions}}'` should include `rootless`.

### 6. Optional: `.devcontainer/.env`

The container doesn't read the repo's `.env` (see "What the sandbox protects"), so its own settings go in `.devcontainer/.env` (gitignored). Paths are relative to `.devcontainer/`; absolute is clearer:

```sh
CONTENT_DIR=/home/you/source/fixedstep-content   # default: content-sample
TZ=America/Los_Angeles
WEB_HOST_PORT=5175   # host port for Vite (default 5173), when another stack already has 5173
```

`WEB_HOST_PORT` also sets the API's `BETTER_AUTH_URL`/`WEB_ORIGIN` to match. If you use GitHub OAuth locally, its callback URL has to use the same port.

## Daily use

From the host (any directory; the script `cd`s to the repo root):

```sh
.devcontainer/devcontainer.sh up       # build (first time) and start postgres + dev; pnpm install, Chromium, firewall
.devcontainer/devcontainer.sh shell    # zsh inside the container, in the repo
.devcontainer/devcontainer.sh claude   # Claude Code inside the container (starts it first if needed)
```

Extra arguments go to Claude. Because the firewall limits what the container can reach, this is the place to use the permission-skipping mode if you want it:

```sh
.devcontainer/devcontainer.sh claude --continue
.devcontainer/devcontainer.sh claude --dangerously-skip-permissions
```

Claude in the container has its own settings, separate from the host's:

- **User settings and login:** the `claude-config` volume (`/root/.claude`), not your host `~/.claude`. You sign in once and it survives rebuilds.
- **Project-local settings:** `.devcontainer/claude-settings.local.json` is mounted read-only over `.claude/settings.local.json`, so the host's file (bubblewrap sandbox, git allow-list, host paths) doesn't apply in here, and Claude can't widen its own permissions. It turns Claude's sandbox off (the container is the sandbox; bubblewrap can't run in it) and keeps the deny rules. Edit it on the host; Claude's "always allow" choices can't be saved to it, so add rules by hand. After editing it, restart the container (`stop`, then `up`): it's a single-file mount, and most editors save by replacing the file, which a running container doesn't see.
- **Shared with the host:** the tracked project config in `.claude/` (`agents/`, `hooks/`, `skills/`) and `CLAUDE.md`, since they come from the repo.

Inside the container everything works as on the host, with Postgres already up:

```sh
pnpm db:migrate && pnpm content:sync   # first time
pnpm dev                               # API + web; open http://localhost:5173 on the host
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e                               # Chromium is preinstalled
```

Stop or remove it from the host:

```sh
.devcontainer/devcontainer.sh stop            # stop, keep containers and volumes
.devcontainer/devcontainer.sh down            # remove containers (volumes, incl. the container's Postgres data, stay)
.devcontainer/devcontainer.sh rebuild         # after changing anything in .devcontainer/ (cached, only changed layers)
.devcontainer/devcontainer.sh rebuild-clean   # from scratch: picks up a new Claude Code
```

Only enter the container through the script (or `devcontainer exec` with the same `setpriv` prefix). A plain `docker exec`, or attaching an editor such as VS Code, gives that session `NET_ADMIN`, so anything running in it can turn the firewall off.

### Why not just `docker compose up`?

`docker compose -f .devcontainer/docker-compose.yml up -d` does start the containers, but it skips the lifecycle hooks in `devcontainer.json`: `pnpm install` and the Chromium download on create, and **the firewall on every start**. Use `.devcontainer/devcontainer.sh up` so the sandbox is actually locked down.

## What the sandbox protects

Root in the container is your host user, not host root (rootless Docker). What keeps an agent in, then, is what's mounted and what the network allows:

- **Not reachable:** the rest of your home directory (`~/.ssh`, `~/.aws`, your host `~/.claude` login, other projects), host processes, the Docker socket, and any host not on the firewall's allowlist.
- **Firewall can't be turned off from inside.** Only `init-firewall.sh` (run by `postStartCommand`) keeps `NET_ADMIN`/`NET_RAW`. Every session `devcontainer.sh` opens, and `postCreateCommand`, starts under `setpriv` with both removed from the inheritable and bounding sets, so no process in it can regain them, even as root. A capability-dropped process also can't ptrace or write the memory of a process that still has them.
- **The sandbox can't be edited from inside.** The image's root filesystem is read-only (writable: the volumes and tmpfs scratch dirs in `docker-compose.yml`), so `setpriv`, the shells and `init-firewall.sh` can't be replaced with something that runs at full capability next time. `.devcontainer/` is mounted read-only over the workspace, and it's self-contained (its own Postgres, its own `.env`), so the container can't change what your next `up` or `rebuild` does on the host. One side effect: a `git switch` inside the container fails if it would change files in `.devcontainer/`.

Check it from a container shell:

```sh
grep CapBnd /proc/self/status     # differs from the container's PID 1: cat /proc/1/status | grep CapBnd
iptables -S                        # fails: Permission denied
curl -sI https://example.com       # fails: blocked by the firewall
```

**Not covered yet:** the rest of the workspace is writable, and some of it runs on your host later: `.git/hooks` and `.git/config` when you use git on the host, `.claude/hooks` and `.claude/settings.json` when you run Claude on the host (`.claude/settings.local.json` is read-only in here), `package.json` scripts and `node_modules` when you run pnpm on the host. Review what changed before running host tools on work done in the container. Credentials you give the container (a Claude login, a `gh` token) can be sent to an allowed host, and GitHub is allowed.

## How it fits together

- **Workspace path:** the repo is mounted at the **same absolute path** as on the host (like the root `docker-compose.yml`), because pnpm records the repo-local `.pnpm-store`'s absolute path in `node_modules`; a different path would make host and container keep reinstalling each other's `node_modules`. The compose file uses `${PWD}`, so it must be started from the repo root, which the script does.
- **Postgres:** the `dev` container shares the `postgres` container's network namespace, so Postgres is on `localhost:5432` inside it, same as on the host. `.env`, `DATABASE_URL` and the e2e harness (`fixedstep_e2e`) need no changes.
- **Separate data:** the compose project is `fixedstep-dev`, so its Postgres volume is separate from the one the host's `pnpm db:up` / `docker compose up` uses, and it doesn't publish 5432. Both can run at once.
- **Ports:** only Vite (`127.0.0.1:5173`) is published to the host; it proxies `/api` to the API on `:3000` inside the container. The container sets `VITE_HOST=0.0.0.0`, which `apps/web/vite.config.ts` reads, so the published port can reach Vite. A host `docker compose up` (which also publishes 5173) and this container can't run at the same time.
- **Content:** `CONTENT_DIR` from `.devcontainer/.env` (default `content-sample`) is mounted at `/content`.
- **File ownership:** the container runs as root, which under rootless Docker maps to your host user. Files written to the workspace (`node_modules`, `.pnpm-store`, commits) stay owned by you.
- **Playwright:** Chromium's system libraries are baked into the image; the browser is downloaded by `postCreateCommand` (before the firewall is up) into the `playwright-browsers` volume.
- **Scratch space:** `/tmp`, `/root/.cache`, `/root/.config` and `/root/.local` are tmpfs, so they're emptied on every stop. Anything that must persist goes in a volume.

## Troubleshooting

- **`additional privileges requested: pass "--allow=fs.read=/tmp/devcontainercli-.../Dockerfile-with-features"`:** buildx bake blocks reading the CLI's generated Dockerfile from `/tmp`. The script sets `BUILDX_BAKE_ENTITLEMENTS_FS=0` to allow it. If you run `devcontainer up` directly, set that variable yourself.
- **`postStartCommand` fails at `ipset create`:** the host modules from step 4 aren't loaded. Check with `lsmod | grep ip_set`.
- **`Cannot connect to the Docker daemon`:** the CLI is talking to the rootful socket. Run `docker context use rootless` or set `DOCKER_HOST` (step 5).
- **`Read-only file system` from some tool:** it writes somewhere outside the volumes and tmpfs dirs. Add a tmpfs entry for that path in `docker-compose.yml` and rebuild.
- **`Failed to download Chrome Headless Shell` / `Could not resolve host` / no network at all:** if `docker exec fixedstep-dev-postgres-1 cat /etc/resolv.conf` shows `127.0.0.53` (not `127.0.0.11`), the containers lost their network, which happens when they're restarted after the rootless Docker daemon restarted. Recreate them: `.devcontainer/devcontainer.sh down && .devcontainer/devcontainer.sh up` (volumes stay).
- **`pnpm install` can't connect after the container has been up a long time:** the firewall resolves the npm registry's CDN addresses once, at start. Run `.devcontainer/devcontainer.sh stop && .devcontainer/devcontainer.sh up`.
- **e2e says Chromium is missing after a Playwright bump:** the firewall blocks Playwright's CDN, so run `.devcontainer/devcontainer.sh rebuild` (the download runs again on create). If the bump needs new system libraries, also bump `PLAYWRIGHT_VERSION` in the Dockerfile.
- **`Bind for 127.0.0.1:5173 failed: port is already allocated`:** another stack (a host `pnpm dev`, `docker compose up`, or another dev container) has 5173. Stop it, or set `WEB_HOST_PORT` in `.devcontainer/.env`.
- **Phone testing on the LAN:** the published port is bound to `127.0.0.1` only. For LAN access, run the web app on the host, or change the `postgres` ports entry in `.devcontainer/docker-compose.yml` to `"5173:5173"`.
