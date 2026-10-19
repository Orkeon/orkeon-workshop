# The workshop in VS Code

*English · [Français](../fr/getting-started/vs-code.md)*

You can work in the workshop from VS Code rather than from a terminal: VS Code then runs the same
container, with your workshop folder on `/workspace`, and its terminals open inside it.

## What you need

- **Docker**, started, as for [Install](./install.md#install-docker);
- **VS Code** ([code.visualstudio.com](https://code.visualstudio.com/)) with its **Dev Containers**
  extension. To install the extension: in VS Code, open the Extensions view (`Ctrl+Shift+X`), type
  `Dev Containers` in the search box, choose the one by Microsoft
  ([its page](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)),
  and click **Install**;
- the image, under its short name `orkeon-workshop`, and your workshop folder with the harness deployed in
  it once. **Start the workshop once with the line of [Install](./install.md#1-start-the-workshop),
  step 1**: it does both, then type `exit` in the terminal of the container to stop it.

## Open the workshop

1. **Open your workshop folder** in VS Code — File → Open Folder, then `%USERPROFILE%\Orkeon` on Windows
   by default.
2. VS Code offers **Reopen in Container** in a notice at the bottom right: click it. Without the notice,
   open the Command Palette (`Ctrl+Shift+P`), type `Reopen in Container`, and choose
   **Dev Containers: Reopen in Container**.

VS Code starts the container and runs the start-up scripts: Claude Code installed when it is missing,
the harness brought in step, the Orkeon and Ollama configuration, the firewall. The first time takes a
minute or two. Then open a terminal (`` Ctrl+` ``) — it is the terminal of the container, already in
`/workspace` — and type `workshop`, or use the Claude Code extension; then type `/workshop-language fr` if
English is not your language ([Your language](./install.md#your-language)).

**No harness in the folder yet**, and you would rather not start the workshop with step 1 of Install? The
harness writes `.devcontainer/devcontainer.json` into the workshop the first time it is deployed; this
deploys it without starting anything, in PowerShell on your computer, with the image already downloaded
([Starting by hand](./install.md#starting-by-hand)):

```powershell
$folder = "$env:USERPROFILE\Orkeon"                          # your workshop
docker run --rm --user node --entrypoint sync-harness.sh -v "${folder}:/workspace" orkeon-workshop
```

## Advanced

### The configuration file

`.devcontainer/devcontainer.json` belongs to your workshop: the harness creates it once and never
changes it again, so adapt it freely. What it sets:

| Setting | Value | Change it when |
|---|---|---|
| `image` | `orkeon-workshop` | you did not tag the image: write `ghcr.io/orkeon/orkeon-workshop:latest` |
| `runArgs` | `--gpus=all`, and the capabilities of the firewall | your computer has no NVIDIA GPU: remove `--gpus=all`, or the container will not start |
| `workspaceMount`, `workspaceFolder` | the opened folder on `/workspace` | never: the harness expects the workshop there |
| `mounts` | a volume for the Claude Code state, `cc-ollama` for the models | you want other volume names |
| `containerEnv` | `CLAUDE_CONFIG_DIR`; the image names no local model | you want one downloaded at the first start: add `"OLLAMA_DEFAULT_MODEL": "qwen3:8b"` (the commented line) |
| `postStartCommand` | the start-up scripts | rarely |

With the firewall up, the model `containerEnv` names cannot be downloaded: its hosts are not on the allow-list, and
the download starts in the background just before the firewall closes. Start the workshop once with the
line of [Install](./install.md#1-start-the-workshop), step 1 — it downloads the model into the same
`cc-ollama` volume —, or add the Ollama hosts of
[Container options](../reference/configuration.md#firewall) to `FIREWALL_EXTRA_DOMAINS` in `containerEnv`.

The container gets no Docker access: it builds and runs teams, not the SonarQube stack
([Docker modes](../guides/docker-modes.md)).

### The configurations of the repository

The repository of Orkeon Workshop has three `devcontainer.json` of its own (`.devcontainer/`,
`.devcontainer/dind/`, `.devcontainer/host-socket/`). They are for **working on the image itself**:
VS Code opens the repository on `/workspace`, builds the image from its sources, and the harness is
not deployed there — the repository is not a workshop, as the start-up message says — unless you give
the checkout a source profile (`-e HARNESS_PROFILE=dev`, or `workshop-profile dev` in a terminal): it
then receives the development skills of that profile
([In a source checkout](../reference/harness.md#in-a-source-checkout)). To build teams, open your
workshop folder as above.

Next: [The workshop](../concepts/workshop.md).
