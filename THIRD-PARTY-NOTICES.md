# Third-party notices

Orkeon Workshop is released under the MIT licence: see [LICENSE](./LICENSE). This file lists what
in this repository comes from elsewhere, and under which terms.

## 1. Files derived from Anthropic's reference devcontainer

Six files started from the reference devcontainer of the Claude Code repository
(<https://github.com/anthropics/claude-code>, folder `.devcontainer/`) and still contain parts of
it:

| File | What comes from the reference devcontainer |
|---|---|
| `.devcontainer/init-firewall.sh` | Most of the script. The project added the optional extra domains, two package hosts, and the rules for the Docker networks, SonarQube and Ollama. |
| `.devcontainer/devcontainer.json`, `.devcontainer/dind/devcontainer.json`, `.devcontainer/host-socket/devcontainer.json` | The shape of the file, the build arguments, the editor customisations, the history and configuration volumes and the workspace mount. The project added the Docker modes, the GPU and build-secret options, the Ollama, SonarQube and workshop mounts, the environment and the start-up commands. |
| `.devcontainer/harness/claude/devcontainer.workshop.json` (the workshop's VS Code configuration, seeded as `.devcontainer/devcontainer.json`) | The same shape: the configuration volume with `CLAUDE_CONFIG_DIR`, the workspace mount, the Claude Code extension, the remote user, the firewall's capabilities and its start-up command. The project added the image, the GPU and Ollama options and the other start-up commands. |
| `.devcontainer/Dockerfile` | A small part: the base package list, a few `ARG` and `ENV` lines, the installation of git-delta and zsh. |

That repository is © Anthropic PBC, all rights reserved; its use is subject to Anthropic's
[Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms). It is not
distributed under an open-source licence.

**The MIT licence of this project covers the changes and additions made here. It does not cover the
parts of these six files that come from Anthropic**, which remain under Anthropic's terms. Of
the six, `init-firewall.sh` and `devcontainer.workshop.json` are also copied into the image, the
published one included, and the latter is seeded into every workshop.

## 2. claude-code-toolkit

Part of the harness — the Bash dispatcher and its modules, the read bounds, the delegation guard,
the report-shape check, the session clean-up, a rule, the eval runner, and in the packs of lot 11 the
development chain, its subagents, the Orkeon layer rules, the quality report and three hooks — is
adapted from claude-code-toolkit, Copyright (c) 2026 Pierre Belin, MIT licence.

The licence text and the file-by-file list of what was adapted are in
[`.devcontainer/harness/THIRD-PARTY.md`](./.devcontainer/harness/THIRD-PARTY.md), which is deployed
with the harness.

## 3. Orkeon

The convention files that the four .NET templates and `OrkeonStudioCheck` share — `.editorconfig`,
`global.json`, `Directory.Build.props`, `Directory.Packages.props` and `nuget.config` — and a few test
files (`tests/.editorconfig`, a test double) are copied or adapted from the Orkeon repository (<https://github.com/Orkeon/orkeon>), Copyright (c) 2024-2026 Orkeon
Contributors, MIT licence.

The licence text and the detail per file are in
[`.devcontainer/csharp/THIRD-PARTY.md`](./.devcontainer/csharp/THIRD-PARTY.md), which ships with
the templates.

## 4. Software installed in the image

The `orkeon-workshop` image is built from this repository. The software its build downloads and
installs is not part of the repository and keeps its own licence. In particular:

- Claude Code is proprietary software of Anthropic; its use is subject to Anthropic's terms.
  **The image this project publishes (`ghcr.io/orkeon/orkeon-workshop`) does not contain it**: a
  container installs it from Anthropic's official npm package when it first starts. An image
  built locally with the default arguments does contain it (`CLAUDE_CODE_VERSION=none` leaves it
  out).
- The Orkeon CLI, the Orkeon packages that the build compiles from the Orkeon sources, and Ollama
  are MIT-licensed. The Ollama bundle also carries NVIDIA's CUDA runtime libraries, under
  NVIDIA's own terms.
- The other tools the build installs — the Debian base, Node, the .NET SDK, Rust, the SonarQube
  scanners, Stryker, Cypress, RTK, graphify and others — are open-source software, each under
  its own licence (MIT, Apache-2.0, LGPL, GPL…).

Whoever builds or distributes an image is responsible for complying with the licences of
everything that image contains.

Orkeon Workshop is not affiliated with or endorsed by Anthropic.

## 5. claude-code-token-usage

`.devcontainer/cc-usage/`, installed in the image as the `cc-usage` command, and the skill `/token-usage`
of the harness's `usage` pack are adapted from claude-code-token-usage
(<https://github.com/pierrebelin/claude-code-token-usage>), Copyright (c) 2026 Pierre Belin, MIT
licence. The licence text is kept in [`.devcontainer/cc-usage/LICENSE`](./.devcontainer/cc-usage/LICENSE);
what changed is listed in [`.devcontainer/cc-usage/README.md`](./.devcontainer/cc-usage/README.md) and
[`.devcontainer/harness/THIRD-PARTY.md`](./.devcontainer/harness/THIRD-PARTY.md).
