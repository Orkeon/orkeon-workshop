# The workshop in VS Code

*English · [Français](../fr/getting-started/vs-code.md)*

You can work in the workshop from VS Code rather than from a terminal: VS Code then runs the same
container, with your workshop folder on `/workspace`, and its terminals open inside it.

## What you need

- VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
  extension;
- the image under its short name `orkeon-workshop` (step 1 of [Install](./install.md));
- the workshop folder, with the harness deployed in it once (below).

## Open the workshop

1. **Deploy the harness once.** The harness writes `.devcontainer/devcontainer.json` into the workshop
   the first time it is deployed. If you already started a container on this folder
   ([Install](./install.md), step 3), it is there. Otherwise, deploy it without starting anything:

   ```powershell
   docker run --rm --user node --entrypoint sync-harness.sh -v "$env:USERPROFILE\Orkeon:/workspace" orkeon-workshop
   ```

2. **Open the folder** `%USERPROFILE%\Orkeon` in VS Code (File → Open Folder).
3. Run **Dev Containers: Reopen in Container** from the Command Palette (`Ctrl+Shift+P`).

VS Code starts the container and runs the start-up scripts: Claude Code installed when it is missing,
the harness brought in step, the Orkeon and Ollama configuration, the firewall. Then open a terminal
(`` Ctrl+` ``) — it is already in `/workspace` — and type `workshop`, or use the Claude Code extension.

With the firewall up, the default model cannot be downloaded: its hosts are not on the allow-list, and
the download starts in the background just before the firewall closes. Start the container once with
`docker run` ([Install](./install.md), step 3 — same `cc-ollama` volume), or add the Ollama hosts of
[Container options](../reference/configuration.md#firewall) to `FIREWALL_EXTRA_DOMAINS` in `containerEnv`.

## The configuration file

`.devcontainer/devcontainer.json` belongs to your workshop: the harness creates it once and never
changes it again, so adapt it freely. What it sets:

| Setting | Value | Change it when |
|---|---|---|
| `image` | `orkeon-workshop` | you did not tag the image: write `ghcr.io/orkeon/orkeon-workshop:latest` |
| `runArgs` | `--gpus=all`, and the capabilities of the firewall | your computer has no NVIDIA GPU: remove `--gpus=all`, or the container will not start |
| `workspaceMount`, `workspaceFolder` | the opened folder on `/workspace` | never: the harness expects the workshop there |
| `mounts` | a volume for the Claude Code state, `cc-ollama` for the models | you want other volume names |
| `postStartCommand` | the start-up scripts | rarely |

The container gets no Docker access: it builds and runs teams, not the SonarQube stack
([Docker modes](../guides/docker-modes.md)).

## The configurations of the repository

The repository of Orkeon Workshop has three `devcontainer.json` of its own (`.devcontainer/`,
`.devcontainer/dind/`, `.devcontainer/host-socket/`). They are for **working on the image itself**:
VS Code opens the repository on `/workspace`, builds the image from its sources, and the harness is
not deployed there — the repository is not a workshop, as the start-up message says. To build teams,
open your workshop folder as above.

Next: [The workshop](../concepts/workshop.md).
