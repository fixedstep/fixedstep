# Sandboxed dev image: Node + pnpm (matching .nvmrc / package.json), Playwright's Chromium deps,
# Claude Code, and the outbound firewall. Everything runs as root, which under rootless Docker maps
# to your host user (see README.md).
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}

ARG TZ
ENV TZ="$TZ"

RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  curl \
  wget \
  ca-certificates \
  build-essential \
  postgresql-client \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# pnpm, pinned to package.json's packageManager.
ARG PNPM_VERSION=10.34.7
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force

# Chromium's system libraries for the e2e suite, installed now because the firewall blocks apt.
# The browser itself is downloaded by postCreateCommand into the playwright-browsers volume, at
# the version e2e/package.json pins. Keep this roughly in step with that version.
ARG PLAYWRIGHT_VERSION=1.64.1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx -y playwright@${PLAYWRIGHT_VERSION} install-deps chromium \
  && rm -rf /var/lib/apt/lists/* && npm cache clean --force

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget -q "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Persist shell history in the commandhistory volume.
RUN mkdir -p /commandhistory && touch /commandhistory/.bash_history /commandhistory/.zsh_history

ENV DEVCONTAINER=true
ENV SHELL=/bin/zsh
ENV EDITOR=nano
ENV VISUAL=nano

ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export HISTFILE=/commandhistory/.zsh_history" \
  -a "setopt INC_APPEND_HISTORY" \
  -x

ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force

COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh

# The container's root filesystem is read-only. These markers tell the devcontainer CLI its
# one-time /etc/environment and /etc/profile patches are done, so it doesn't try to write /etc.
RUN mkdir -p /var/devcontainer && \
  touch /var/devcontainer/.patchEtcEnvironmentMarker /var/devcontainer/.patchEtcProfileMarker
