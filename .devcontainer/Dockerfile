FROM node:24-bookworm

# Orkeon Workshop — a Claude Code devcontainer dedicated to building, testing and shipping
# Orkeon agent teams (YAML, TypeScript, C#) and Orkeon tools in C#. Image name: orkeon-workshop.
# (The image labels, and Claude Code, come at the end of this file so that they never
# invalidate the cache of the layers below.)
#
# Provenance: a small part of this file (the base package list, a few ARG and ENV lines, the
# installation of git-delta and zsh) comes from the reference devcontainer of the Claude Code
# repository (https://github.com/anthropics/claude-code), (c) Anthropic PBC, all rights
# reserved. Those parts are not covered by the MIT licence of this project: see
# THIRD-PARTY-NOTICES.md at the root of the repository.

ARG GIT_DELTA_VERSION=0.18.2
ARG ZSH_IN_DOCKER_VERSION=1.2.0

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  gosu \
  fzf \
  zsh \
  man-db \
  unzip \
  zstd \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  curl \
  wget \
  nano \
  vim \
  python3 \
  python3-pip \
  python3-venv \
  python3-dev \
  python3-yaml \
  build-essential \
  pkg-config \
  libssl-dev \
  ca-certificates \
  lsb-release \
  apt-transport-https \
  dos2unix \
  tmux \
  socat \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Docker CLI from Debian repos
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Bake Docker daemon config (overlay2, log rotation, BuildKit cache GC) to bound
# Docker-in-Docker disk usage. Only read in DinD mode; inert when mounting the host socket.
RUN mkdir -p /etc/docker
COPY daemon.json /etc/docker/daemon.json

# Use BuildKit for in-container builds so builder.gc actually governs the build cache.
# (The legacy builder is the default on docker.io 20.10 and is NOT covered by builder.gc.)
ENV DOCKER_BUILDKIT=1
ENV COMPOSE_DOCKER_CLI_BUILD=1

# Install Docker Compose v2 plugin
ARG DOCKER_COMPOSE_VERSION=v2.32.4
RUN ARCH="$(uname -m)" && \
  mkdir -p /usr/local/lib/docker/cli-plugins && \
  curl -fsSL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose && \
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install .NET SDK
RUN wget https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -O packages-microsoft-prod.deb && \
  dpkg -i packages-microsoft-prod.deb && \
  rm packages-microsoft-prod.deb && \
  apt-get update && \
  apt-get install -y dotnet-sdk-10.0 && \
  dotnet workload update && \
  dotnet workload install wasm-tools && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Java JRE (required by dotnet-sonarscanner)
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jre-headless \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install dotnet global tools
RUN DOTNET_TOOL_PATH="/usr/local/share/dotnet-tools" && \
  mkdir -p "$DOTNET_TOOL_PATH" && \
  dotnet tool install dotnet-sonarscanner --tool-path "$DOTNET_TOOL_PATH" && \
  dotnet tool install dotnet-stryker --tool-path "$DOTNET_TOOL_PATH" && \
  dotnet tool install dotnet-coverage --tool-path "$DOTNET_TOOL_PATH" && \
  dotnet tool install dotnet-reportgenerator-globaltool --tool-path "$DOTNET_TOOL_PATH"
ENV PATH="/usr/local/share/dotnet-tools:${PATH}"

# Install SonarScanner CLI
ARG SONAR_SCANNER_VERSION=8.0.1.6346
RUN ARCH="$(uname -m)" && \
  if [ "$ARCH" = "aarch64" ]; then SONAR_ARCH="linux-aarch64"; \
  else SONAR_ARCH="linux-x64"; fi && \
  curl -fsSL "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}-${SONAR_ARCH}.zip" -o /tmp/sonar-scanner.zip && \
  unzip -q /tmp/sonar-scanner.zip -d /opt && \
  mv /opt/sonar-scanner-${SONAR_SCANNER_VERSION}-${SONAR_ARCH} /opt/sonar-scanner && \
  rm /tmp/sonar-scanner.zip
ENV PATH="/opt/sonar-scanner/bin:${PATH}"

# Create symbolic link for python command
RUN ln -s /usr/bin/python3 /usr/bin/python

# Shell helpers that follow their upstream head on purpose (graphify, claude-usage, RTK, the npm
# globals except esbuild): nothing a team runs depends on them, and the build cache keeps the
# version of the first build until a build without cache (`--no-cache`, or the `no_cache` input
# of the image workflow) refreshes them.
# Install graphify (AST knowledge graph — cross-module queries, codebase navigation)
RUN pip install --break-system-packages git+https://github.com/safishamsi/graphify.git && \
    graphify --version

# Install Rust toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    rustc \
    cargo \
    rustfmt \
    rust-clippy \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Cypress system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgtk2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnotify-dev \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    xauth \
    xvfb \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install global npm packages
# esbuild: transpiler of Orkeon's .ork.ts crews, found on the PATH (version pinned by Orkeon)
ARG ESBUILD_VERSION=0.25.12
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin
RUN npm install -g \
  @stryker-mutator/core \
  @stryker-mutator/jest-runner \
  @stryker-mutator/mocha-runner \
  @stryker-mutator/vitest-runner \
  @stryker-mutator/typescript-checker \
  typescript \
  esbuild@${ESBUILD_VERSION} \
  cypress

# (Claude Code is installed at the very end of this file.)

# Install claude-usage (no dependencies needed, uses only Python stdlib)
RUN git clone https://github.com/phuryn/claude-usage /usr/local/share/claude-usage && \
    echo '#!/bin/sh\ncd /usr/local/share/claude-usage && exec python3 cli.py dashboard --host 0.0.0.0 "$@"' > /usr/local/bin/claude-usage-dashboard && \
    chmod +x /usr/local/bin/claude-usage-dashboard

# Install RTK binary (init runs at runtime in entrypoint, as target user)
RUN curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh -s && \
    cp /root/.local/bin/rtk /usr/local/bin/ && \
    chmod +x /usr/local/bin/rtk

# Environment variables
ENV DEVCONTAINER=true
ENV DOCKER_API_VERSION=1.41
ENV SHELL=/bin/zsh
ENV EDITOR=nano
ENV VISUAL=nano
ENV RUST_BACKTRACE=1

# Ensure npm global dir is accessible
RUN mkdir -p /usr/local/share/npm-global

# Persist bash history (writable by node)
RUN mkdir -p /commandhistory && \
  touch /commandhistory/.bash_history && \
  chown -R node:node /commandhistory

# Create workspace and ensure node user ownership
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude
WORKDIR /workspace

# Install git-delta
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Install zsh-in-docker for root
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -a 'export PATH="$HOME/.local/bin:$HOME/.dotnet/tools:/usr/local/share/dotnet-tools:$PATH"' \
  -a '[ -f ~/.sonar-token ] && source ~/.sonar-token' \
  -x

# Copy node user's zsh config from root
RUN cp /root/.zshrc /home/node/.zshrc && \
  sed -i 's|/root/|/home/node/|g' /home/node/.zshrc && \
  cp -r /root/.oh-my-zsh /home/node/.oh-my-zsh 2>/dev/null || true && \
  cp -r /root/.p10k.zsh /home/node/.p10k.zsh 2>/dev/null || true && \
  chown -R node:node /home/node

# Safety net: ensure node always has a .zshrc
RUN [ -f /home/node/.zshrc ] || (touch /home/node/.zshrc && chown node:node /home/node/.zshrc)

# Ensure npm global dir is writable by node
RUN chown -R node:node /usr/local/share/npm-global

# Install Ollama (official Linux bundle, CUDA runners included: the GPU is used when the
# container runs with --gpus=all). Pinned: with "latest" the build cache would silently
# freeze whatever version was current at the first build. The paths used by `node` are
# created here so that a volume mounted on the models directory gets the right owner.
ARG OLLAMA_VERSION=0.35.0
COPY --chmod=0755 install-ollama.sh /usr/local/bin/
RUN dos2unix -q /usr/local/bin/install-ollama.sh && \
  install-ollama.sh "${OLLAMA_VERSION}" && \
  ollama --version && \
  ! find /usr/local/lib/ollama -maxdepth 1 -type f \( -name '*.so*' -o -name 'llama-server' \) -exec ldd {} + | grep 'not found' && \
  mkdir -p /home/node/.ollama/models /home/node/.config && \
  touch /var/log/ollama.log && \
  chown -R node:node /home/node/.ollama /home/node/.config /var/log/ollama.log

# Orkeon (D32): by default built from the sources of Orkeon/orkeon at ORKEON_SOURCE_REF — the
# head of main unless a branch, tag or commit is given — so that the image carries the latest
# code without any token: the CLI (dotnet tool `orkeon`, installed by orkeon-update.sh) and, from
# the same checkout, the packages nuget.org does not carry (Orkeon.Plugins, Orkeon.Hosting and
# their closure), packed into a local NuGet feed for the .NET templates. One step, so that the
# checkout and its build output never reach a layer. ORKEON_CHANNEL=release (the latest tagged
# prerelease from nuget.org) or dev (GitHub Packages, with the github_packages_token secret)
# install a published CLI instead, and pack the packages from its tag. The build cache keeps the
# commit of the first build: give ORKEON_REFRESH a new value (the CI passes the commit of main).
COPY --chmod=0755 orkeon-update.sh /usr/local/bin/
COPY csharp/scripts/build-orkeon-packages.sh csharp/scripts/orkeon-pack-helper.py /usr/local/share/orkeon-harness/csharp/scripts/
ARG ORKEON_CHANNEL=source
ARG ORKEON_SOURCE_REF=main
ARG ORKEON_VERSION=
ARG ORKEON_REFRESH=
RUN --mount=type=secret,id=github_packages_token \
  dos2unix -q /usr/local/bin/orkeon-update.sh && \
  ln -sf orkeon-update.sh /usr/local/bin/orkeon-update && \
  find /usr/local/share/orkeon-harness/csharp/scripts -type f -exec dos2unix -q {} + 2>/dev/null; \
  chmod +x /usr/local/share/orkeon-harness/csharp/scripts/*.sh && \
  echo "Orkeon refresh: ${ORKEON_REFRESH:-none}" && \
  if [ "${ORKEON_CHANNEL}" = "source" ]; then \
    orkeon-update.sh --source "${ORKEON_SOURCE_REF}" --source-dir /tmp/orkeon-src/orkeon; \
  else \
    orkeon-update.sh --channel "${ORKEON_CHANNEL}" ${ORKEON_VERSION:+--version "${ORKEON_VERSION}"}; \
  fi && \
  (cd /tmp && orkeon --version && \
   orkeon doctor --json | jq -e '.[] | select(.check == "esbuild") | .status == "ok"' >/dev/null) && \
  ver="$(sed -n 's/^version=//p' /usr/local/share/orkeon/install-stamp)" && \
  if [ -d /tmp/orkeon-src/orkeon/.git ]; then \
    /usr/local/share/orkeon-harness/csharp/scripts/build-orkeon-packages.sh "${ver}" /usr/local/share/orkeon/packages /tmp/orkeon-src/orkeon; \
  else \
    /usr/local/share/orkeon-harness/csharp/scripts/build-orkeon-packages.sh "${ver%%.dev.*}" /usr/local/share/orkeon/packages; \
  fi && \
  rm -rf /tmp/.orkeon /root/.nuget /root/.local/share/NuGet /tmp/orkeon-src

# .NET templates of the harness (Orkeon tool, plugin, crew host, plugin-aware runner) and the
# Studio check. The firewall does not let the container reach nuget.org: the packages they need are
# restored once here, into a cache shared by every session (NUGET_PACKAGES).
COPY csharp/ /usr/local/share/orkeon-harness/csharp/
# ORKEON_HARNESS_OFFLINE=1 switches the NuGet vulnerability audit of the templates off: it is
# the only part of a restore that still needs the network once the cache is warm.
ENV NUGET_PACKAGES=/usr/local/share/nuget-packages \
    ORKEON_HARNESS_OFFLINE=1
# Pre-warm the shared package cache with what every template needs, and ship the plugin-aware
# runner as a binary (publishing it is also what downloads the local-embeddings model into the
# cache; build-time network: nuget.org, huggingface.co), and orkeon-studio-check, which reads the
# workshop's teams with Orkeon Studio's own code. run.cmd keeps its CRLF line endings.
# The templates reference the Orkeon packages by $(OrkeonVersion): it becomes the version of
# the local feed, the one just built from the sources.
RUN H=/usr/local/share/orkeon-harness/csharp; \
  find "$H" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.md' -o -name '*.json' -o -name '*.config' -o -name '*.props' -o -name '*.cs' -o -name '*.csproj' -o -name '*.sln' -o -name '*.slnx' -o -name '*.yaml' -o -name '*.yml' -o -name '*.ts' -o -name '*.txt' -o -name '.editorconfig' -o -name '.gitignore' \) -exec dos2unix -q {} + 2>/dev/null; \
  find "$H" -type f -name '*.sh' -exec chmod +x {} + && \
  pv="$(sed -n 's/^version=//p' /usr/local/share/orkeon/packages/MANIFEST.txt)" && [ -n "$pv" ] && \
  sed -i "s|<OrkeonVersion>[^<]*</OrkeonVersion>|<OrkeonVersion>${pv}</OrkeonVersion>|" "$H"/Orkeon*/Directory.Packages.props && \
  echo "templates use Orkeon $pv" && \
  mkdir -p "$NUGET_PACKAGES" && \
  for t in "$H"/Orkeon*/; do \
    rm -rf /tmp/template && cp -r "$t" /tmp/template && dotnet restore /tmp/template --nologo -v q || exit 1; \
  done && \
  rm -rf /tmp/template && cp -r "$H/OrkeonRunner" /tmp/template && \
  dotnet publish /tmp/template/src/OrkeonHarnessRun -c Release --use-current-runtime --self-contained false \
    -o /usr/local/lib/orkeon-harness-run --nologo -v q && \
  chmod -R a+rX /usr/local/lib/orkeon-harness-run && \
  ln -sf /usr/local/lib/orkeon-harness-run/orkeon-harness-run /usr/local/bin/orkeon-harness-run && \
  rm -rf /tmp/template && cp -r "$H/OrkeonStudioCheck" /tmp/template && \
  dotnet publish /tmp/template/src/OrkeonStudioCheck -c Release --use-current-runtime --self-contained false \
    -o /usr/local/lib/orkeon-studio-check --nologo -v q && \
  chmod -R a+rX /usr/local/lib/orkeon-studio-check && \
  ln -sf /usr/local/lib/orkeon-studio-check/orkeon-studio-check /usr/local/bin/orkeon-studio-check && \
  rm -rf /tmp/template /root/.local/share/NuGet && chown -R node:node "$NUGET_PACKAGES" && \
  cd /tmp && orkeon-harness-run --list-tools >/dev/null && orkeon-studio-check --help >/dev/null

# Self-check of the templates: every template restores, builds and passes its tests with
# nuget.org unreachable, and the runner loads the sample plugin end to end. HARNESS_VERIFY=0
# skips it (faster rebuilds while iterating on the image).
ARG HARNESS_VERIFY=1
RUN [ "$HARNESS_VERIFY" != "1" ] || { \
      /usr/local/share/orkeon-harness/csharp/scripts/verify-templates.sh --offline --smoke && \
      find "$NUGET_PACKAGES" ! -user node -exec chown node:node {} + && \
      rm -rf /tmp/* /root/.local/share/NuGet; }
# (Only what the check created is re-owned: a recursive chown would copy the whole cache into
# this layer.)

# orkeon-bench: the harness CLI (TypeScript). Built and tested at image build; the launcher is
# linked on the PATH.
COPY bench/ /usr/local/share/orkeon-bench/
RUN cd /usr/local/share/orkeon-bench && \
  find . -type f \( -name '*.sh' -o -name '*.json' -o -name '*.ts' -o -name '*.md' -o -name '*.cjs' -o -path './bin/*' \) -not -path './node_modules/*' -exec dos2unix -q {} + 2>/dev/null || true; \
  npm ci --no-audit --no-fund && npm run build && npm test && npm prune --omit=dev && \
  chmod +x bin/orkeon-bench && ln -sf /usr/local/share/orkeon-bench/bin/orkeon-bench /usr/local/bin/orkeon-bench && \
  orkeon-bench --version

# The workshop: where the harness is deployed, where Claude Code opens (`workshop`) and where
# Studio reads its team catalogue (teams/). The host's Orkeon folder is bind-mounted on
# /workspace (D26), the folder created above, where shells open (WORKDIR).
ENV ORKEON_WORKSHOP=/workspace

# Ollama runtime defaults, read by init-orkeon.sh (OLLAMA_MODE: local | host | off).
# Never name such variables ORKEON_*: Orkeon loads every ORKEON_* variable into its
# own configuration and secret provider.
ENV OLLAMA_MODE=local
ENV OLLAMA_DEFAULT_MODEL=qwen3:8b
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility
# Context window of the local server. Orkeon does not send num_ctx, and below 24 GB of
# VRAM Ollama defaults to 4096 tokens, which an agent with tools overflows (the prompt is
# then truncated silently). 8192 is Orkeon's own default for local models and the most
# that keeps qwen3:8b entirely on an 8 GB GPU. Raise it with -e on a larger GPU.
ENV OLLAMA_CONTEXT_LENGTH=8192

# Copy scripts and resources
COPY init-firewall.sh /usr/local/bin/
COPY entrypoint.sh /usr/local/bin/
COPY init-docker.sh /usr/local/bin/
COPY init-sonarqube.sh /usr/local/bin/
COPY setup-sonar-scripts.sh /usr/local/bin/
COPY clean-restore.sh /usr/local/bin/
COPY init-orkeon.sh /usr/local/bin/
COPY sync-harness.sh /usr/local/bin/
# Manifest of the skills the pre-harness images deployed into <workspace>/.claude/skills:
# sync-harness.sh uses it to retire them from existing workspaces.
COPY skills-legacy.manifest /usr/local/share/claude-skills.legacy-manifest
COPY docker-compose.sonarqube.yml /usr/local/share/sonarqube/
COPY sonar-analyze.sh /usr/local/share/sonarqube/
COPY SONARQUBE.md /usr/local/share/sonarqube/
# The harness: .claude (skills, agents, rules, hooks, templates, settings), references, library
# seeds, example teams and the evals. sync-harness.sh deploys it into the workshop at start.
COPY harness/ /usr/local/share/claude-harness/

# Fix Windows CRLF line endings
RUN dos2unix /usr/local/bin/*.sh \
             /usr/local/share/sonarqube/*.sh \
             /usr/local/share/sonarqube/*.yml \
             /usr/local/share/sonarqube/*.md \
             /etc/docker/daemon.json 2>/dev/null || true
RUN find /usr/local/share/claude-harness -type f \( -name '*.md' -o -name '*.json' -o -name '*.sh' -o -name '*.py' -o -name '*.yaml' -o -name '*.yml' -o -name '*.ts' -o -name '*.txt' \) -exec dos2unix -q {} + 2>/dev/null || true
RUN chmod +x /usr/local/bin/init-firewall.sh \
             /usr/local/bin/entrypoint.sh \
             /usr/local/bin/init-docker.sh \
             /usr/local/bin/init-sonarqube.sh \
             /usr/local/bin/setup-sonar-scripts.sh \
             /usr/local/bin/clean-restore.sh \
             /usr/local/bin/init-orkeon.sh \
             /usr/local/bin/sync-harness.sh \
             /usr/local/share/sonarqube/sonar-analyze.sh \
             /usr/local/bin/claude-usage-dashboard && \
    ln -sf setup-sonar-scripts.sh /usr/local/bin/setup-sonar-scripts && \
    find /usr/local/share/claude-harness -type f \( -name '*.sh' -o -name '*.py' \) -exec chmod +x {} +

# The hooks and scripts of the harness are checked at build: a hook that emits the wrong bytes
# must not reach a workshop, and every tool a case needs is here, so a skipped case fails too
# (HARNESS_EVALS_STRICT=1). Then the manifest (path + hash) that sync-harness.sh compares at
# container start with what it deployed last time.
RUN HARNESS_EVALS_STRICT=1 bash /usr/local/share/claude-harness/evals/run.sh && \
    /usr/local/bin/sync-harness.sh --write-manifest /usr/local/share/claude-harness /usr/local/share/claude-harness.manifest

# Add node user to docker group and grant passwordless sudo
RUN groupadd -f docker && usermod -aG docker node \
  && echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
  && chmod 0440 /etc/sudoers.d/node

# Pre-create dockerd log file
RUN touch /var/log/dockerd.log && chmod 666 /var/log/dockerd.log

# `workshop`: opens Claude Code in the workshop. Declared here rather than in the zsh setup
# above so that the layers in between keep their build cache.
RUN for rc in /root/.zshrc /home/node/.zshrc /etc/bash.bashrc; do \
      printf '\n# Open Claude Code in the Orkeon workshop (installing it first when the container has none)\nworkshop() { /usr/local/bin/init-claude-code.sh; cd "${ORKEON_WORKSHOP:-/workspace}" || return; if [ ! -f .claude/.harness-manifest ]; then echo "workshop: no harness in $PWD (sync-harness.sh --adopt deploys it)" >&2; elif [ -z "$(ls -A teams 2>/dev/null)" ]; then echo "workshop: new here? Once Claude Code is open, type /orkeon-tour for a guided tour" >&2; fi; claude "$@"; }\n' >> "$rc"; \
    done && \
    printf '%s\n' \
      '# Login shells rebuild PATH from /etc/profile: put back what the image added to it' \
      '# (claude, esbuild, the dotnet tools, sonar-scanner).' \
      'for d in /usr/local/share/npm-global/bin /usr/local/share/dotnet-tools /opt/sonar-scanner/bin; do' \
      '  case ":$PATH:" in *":$d:"*) ;; *) PATH="$PATH:$d" ;; esac' \
      'done' \
      'export PATH' > /etc/profile.d/orkeon-harness-path.sh

# Claude Code, last: changing its version, or this script, rebuilds only what follows. It is
# Anthropic's proprietary software. CLAUDE_CODE_VERSION=none leaves it out of the image - the
# image this project publishes is built that way - and the container then installs it when it
# first starts (init-claude-code.sh, called by the entrypoint and by the devcontainer
# configurations). With "none" the build checks that the image really carries no copy of it.
COPY --chmod=0755 init-claude-code.sh /usr/local/bin/
ARG CLAUDE_CODE_VERSION=latest
RUN dos2unix -q /usr/local/bin/init-claude-code.sh && \
    if [ "$CLAUDE_CODE_VERSION" = "none" ]; then \
      ! command -v claude >/dev/null 2>&1 && \
      [ -z "$(find /usr/local /opt /home/node /root -path '*/@anthropic-ai/claude-code*' -print -quit 2>/dev/null)" ]; \
    else \
      /usr/local/bin/init-claude-code.sh --strict; \
    fi

# Nothing the build left in /tmp travels into the image, and Orkeon's sandbox root is usable by
# every user: Orkeon creates /tmp/orkeon-sandbox/<pid>-<stamp> at each run, and a root-owned
# parent (left by a check run as root during the build, or by a later `sudo orkeon`) would make
# every run of `node` abort with "Access to the path is denied".
RUN rm -rf /tmp/* /tmp/.[!.]* 2>/dev/null; \
    mkdir -p /tmp/orkeon-sandbox && chmod 1777 /tmp/orkeon-sandbox && \
    find /usr/local/lib/orkeon-harness-run /usr/local/lib/orkeon-studio-check ! -perm -o=r -exec chmod a+rX {} + && \
    su node -s /bin/sh -c 'cd /tmp && orkeon run --list-tools >/dev/null && orkeon-harness-run --list-tools >/dev/null && orkeon-studio-check --help >/dev/null' && \
    { rm -rf /tmp/orkeon-sandbox/* 2>/dev/null; true; }
# (The runner and the Studio check are published by root: anything they left unreadable for
# others is opened here, and the CLIs are run once as node - the user every session runs as - so
# that a permission problem fails the build instead of the first team.)

LABEL org.opencontainers.image.title="orkeon-workshop" \
      org.opencontainers.image.description="Claude Code harness for Orkeon agent teams"

# The time zone, last, so that it is no part of the cache key of the layers above (the CI builds
# with Etc/UTC; `-e TZ=…` on `docker run` sets it at run time as well).
ARG TZ
ENV TZ="$TZ"

# Entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/zsh"]