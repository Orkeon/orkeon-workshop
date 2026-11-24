---
name: orkeon-update
description: "Updates the container's Orkeon CLI (the release nuget.org publishes — what the image carries, D110 —, the latest dev build from GitHub Packages, or a build from the sources of Orkeon's main branch, a tag or a commit) and, on request, Ollama, by driving the image's `orkeon-update` script. Use this skill when the user asks to update Orkeon or Ollama, switch to the latest dev build, go back to a tagged or specific version, or find out which version is installed and where it comes from — even if they simply say 'update orkeon' or 'what is the orkeon version'."
argument-hint: "[check | source [ref] | dev | release | <version>] [ollama]"
---

# Update Orkeon (and Ollama)

Everything goes through `orkeon-update`, provided by the image. You reimplement nothing: you run the
script, read its output, report back. Don't call `dotnet tool update` yourself: in a container it
fails ("Invalid cross-device link", the tool comes from an image layer). The script installs each
version in its own folder, isolates the NuGet configuration, handles the token and keeps the
typings up to date.

Request: $ARGUMENTS

## 1. Current state

```bash
orkeon-update --check
```

Gives the installed Orkeon version and the channel it comes from, the latest version of each
channel, the Ollama version, its mode (`local`, `host`, `off`), whether it runs on GPU or CPU and
the models present. If that is all the user asked for, answer and stop.

## 2. Update

| Request | Command |
|---|---|
| "update" with no details, or "the latest Orkeon" | `orkeon-update --channel release` — the latest version published on nuget.org (with the firewall on, `api.nuget.org` must be in `FIREWALL_EXTRA_DOMAINS`) — but read `--check` first: when the installed version is a source build (`<version of the sources>-src.<date>.g<commit>`: a build of `main`, the image's while D115 holds) whose commit the latest release does not hold; `gh api repos/Orkeon/orkeon/compare/v<latest>...<commit> --jq .status`, or without a `gh` login `curl -s https://api.github.com/repos/Orkeon/orkeon/compare/v<latest>...<commit> | jq -r .status`, answers `ahead` or `diverged` —, there is nothing newer, and the release would take away the fixes that build carries. Say so and do not run it unless the user asks again knowing it. Once a release holds the commit (`behind` or `identical`), run it |
| specific version | `orkeon-update --version 1.2.0` |
| an unreleased Orkeon: `main`, a branch, a tag or a commit | `orkeon-update --source [<ref>]` — rebuilds the CLI from the sources (a few minutes; needs github.com and nuget.org) |
| latest published dev build (token needed) | `orkeon-update --channel dev` |
| Ollama too | add `--ollama` (or `--ollama 0.35.0` for a given version) |

The script refuses to run while an `orkeon` process is running: wait for the crew to finish.
`--source` takes minutes: run it detached, `nohup orkeon-update --source > "$log" 2>&1 & echo $!`, then
wait in slices of at most 270 seconds, `timeout 270 tail --pid=<pid> -f /dev/null`, reading the last
lines of the log between two slices. Never `sleep` in the foreground.

With no explicit channel or version, it never downgrades: if the installed version is newer than
the latest of the reachable channel (a build from the sources, a container without a token),
it keeps it and says so. Going back to the tagged version must be requested: `--channel release`.

The harness — its references, its tool catalogue, its checks — is established on the Orkeon the image
carries (`orkeon-bench doctor` names it: the release 1.4.0), and Orkeon Code and
Orkeon Studio on that same Orkeon: another
Orkeon in the container is the user's choice, and `doctor` then warns. Say so before updating.

### The dev channel needs a token

Dev builds of the tool package (`<version>.dev.<n>`, the latest green `main`) are published only on GitHub Packages,
which requires a token even for a public repository: a **personal access token classic** with the
`read:packages` scope. The script looks for it in `$GITHUB_PACKAGES_TOKEN`, then in
`/run/secrets/github_packages_token`, then via `gh auth token`.

Without a usable token, `orkeon-update` installs the latest version on nuget.org and says so;
`--channel dev` fails. Then explain to the user how to provide the token, in the shape of HARNESS.md
rule 10 (`references/process/hand-over.md` § 5): for this session, `/exit`, then
`workshop --secret GITHUB_PACKAGES_TOKEN`, which opens Claude Code again, where they ask for the update
once more; for the container, on their computer, `-e GITHUB_PACKAGES_TOKEN` on `docker run` with the variable set in that terminal, or a
file mounted read-only on `/run/secrets/github_packages_token`. Never ask them to paste it into the
conversation, never write it to any file, never a script that holds it.

## 3. Verify

```bash
orkeon --version && orkeon doctor
```

- `esbuild` warning: `.ork.ts` crews won't run — `npm install -g esbuild@0.25.12`.
- `tsc` row (Orkeon 1.2.0): `ok` when no `tsc` is found and nothing requires it — `orkeon run --validate`
  then skips the type check of a `.ork.ts` with a warning —; `fail` (exit 1) only when
  `Orkeon:Scripting:Toolchain:TypeCheck` is `Always` and `tsc` is missing: `npm install -g typescript`, or
  `Orkeon:Scripting:Toolchain:TscPath`.
- `runner-settings` failing: the settings file holds a key or a value this Orkeon refuses at its start,
  and every run stops on it — the row names the key; correct the file (`references/orkeon/cli.md` § 5).
- `llm-reachability` failing right after `--ollama`: the server is restarting; rerun `init-orkeon.sh`, then `orkeon doctor`.
- `llm-config` must report the **Ollama** provider. If it reports something else with a `qwen*`
  model, the `BaseUrl` is gone from the configuration: `orkeon init --provider ollama --model <model> --force`.
  That rewrites the whole file with `Llm.Model` and `Llm.BaseUrl` only: rerun `init-orkeon.sh`, which puts
  back one request at a time (`RateLimiting`) and `Llm.StreamIdleSeconds` at 120 and `Llm.ContextWindowTokens` at the server's window (D117), and set `Llm.TimeoutSeconds` back to 600 — or delete the
  file and rerun `init-orkeon.sh`, which recreates it whole.

## 4. Report back

Reply in the user's language, briefly:
- versions before → after (Orkeon, and Ollama if it was requested), channel used and the reason for any fallback;
- result of `orkeon doctor`;
- reminder: the update only applies to **this container**. For all containers, the image must be
  rebuilt with a new value of `--build-arg ORKEON_REFRESH` (see, in the repository, the section
  "Building" of the image README `.devcontainer/README.md`, and `docs/guides/updating.md`).
