#!/usr/bin/env bash
# The tests of install/start-workshop.sh, on a fake docker that records its arguments: no Docker,
# no network. Run: bash install/tests/start-workshop.test.sh — exit 0 when every case passes.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../start-workshop.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
failures=0

# A bin folder with the tools the script uses, and nothing else: docker is added by setup.
tools="$tmp/tools"
mkdir -p "$tools"
for t in bash sed grep ls paste head awk df id mkdir cat env touch; do ln -s "$(command -v "$t")" "$tools/$t"; done

# The fake docker. Its state, under $FAKE: c/<name>.status|.binds|.env|.gpu (a container),
# i/<image> (an image, its env lines), v/<volume>, gpu (the probe succeeds), down (no daemon), ps.
cat > "$tools/docker.fake" <<'EOF'
#!/usr/bin/env bash
f="$FAKE"
printf '%s\n' "$*" >> "$f/log"
case "$1" in
    info)
        [ ! -e "$f/down" ] || { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
        [ "${2:-}" != -f ] || echo /nonexistent ;;
    inspect)
        n="$4"; [ -f "$f/c/$n.status" ] || exit 1
        case "$3" in
            *State.Status*) cat "$f/c/$n.status" ;;
            *HostConfig.Binds*) cat "$f/c/$n.binds" ;;
            *Config.Env*) cat "$f/c/$n.env" 2>/dev/null || true ;;
            *DeviceRequests*) cat "$f/c/$n.gpu" 2>/dev/null || echo 0 ;;
            *.Image*) echo sha256:old ;;
        esac ;;
    image)
        img="${!#}"; [ -e "$f/i/$img" ] || exit 1
        case "$*" in *Config.Env*) cat "$f/i/$img" ;; esac ;;
    volume)
        case "$2" in inspect) [ -e "$f/v/$3" ]; exit ;; create) touch "$f/v/$3"; echo "$3" ;; esac ;;
    run)
        case "$*" in *"--entrypoint true"*) [ -e "$f/gpu" ]; exit ;; esac ;;
    ps) cat "$f/ps" 2>/dev/null || true ;;
esac
exit 0
EOF
chmod +x "$tools/docker.fake"
# The fake git: `remote get-url origin` answers the origin recorded in $FAKE/origin, if any.
cat > "$tools/git" <<'EOF'
#!/usr/bin/env bash
[ -f "$FAKE/origin" ] && cat "$FAKE/origin" || exit 128
EOF
chmod +x "$tools/git"

setup() {   # $1 = with docker (yes/no)
    FAKE="$tmp/fake.$RANDOM$RANDOM"
    mkdir -p "$FAKE/c" "$FAKE/i" "$FAKE/v" "$FAKE/bin"
    : > "$FAKE/log"
    for t in "$tools"/*; do [ "${t##*/}" = docker.fake ] || ln -s "$t" "$FAKE/bin/"; done
    [ "${1:-yes}" = no ] || ln -s "$tools/docker.fake" "$FAKE/bin/docker"
    export FAKE
    HOME="$FAKE/home"; mkdir -p "$HOME"
}
container() {   # $1 name, $2 status, then bind lines
    local n="$1" s="$2"; shift 2
    echo "$s" > "$FAKE/c/$n.status"
    printf '%s\n' "$@" > "$FAKE/c/$n.binds"
}
container_env() {   # $1 name, then env lines
    local n="$1"; shift
    printf '%s\n' "$@" > "$FAKE/c/$n.env"
}
start() {   # the arguments of the script; sets out, rc
    out="$(cd "$FAKE" && env -i PATH="$FAKE/bin" HOME="$HOME" FAKE="$FAKE" ${EXTRA_ENV:+"$EXTRA_ENV"} bash "$script" "$@" 2>&1)"
    rc=$?
}
fail() { echo "FAIL $case_name: $*"; echo "$out" | sed 's/^/    | /'; failures=$((failures + 1)); }
expect_rc() { [ "$rc" = "$1" ] || fail "exit $rc, expected $1"; }
expect_out() { [ "$1" != -- ] || shift; grep -qF -- "$1" <<<"$out" || fail "output lacks: $1"; }
refute_out() { ! grep -qF -- "$1" <<<"$out" || fail "output has: $1"; }
expect_log() { grep -qF -- "$1" "$FAKE/log" || fail "docker not called with: $1"; }
refute_log() { ! grep -qF -- "$1" "$FAKE/log" || fail "docker called with: $1"; }
last_call() { tail -n 1 "$FAKE/log"; }
expect_last() { last_call | grep -qF -- "$1" || fail "last call lacks: $1 (was: $(last_call))"; }
refute_last() { ! last_call | grep -qF -- "$1" || fail "last call has: $1"; }

case_name="docker missing"; setup no
start; expect_rc 1; expect_out "Docker is not installed"

case_name="docker not answering"; setup; touch "$FAKE/down"
start; expect_rc 1; expect_out "Docker does not answer"; refute_log "run"

case_name="first start with a GPU"; setup; touch "$FAKE/gpu"
start --folder "$HOME/Orkeon"; expect_rc 0
[ -d "$HOME/Orkeon" ] || fail "folder not created"
expect_log "pull ghcr.io/orkeon/orkeon-workshop:latest"
expect_log "tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop"
expect_log "volume create my-orkeon-workshop-claude"
expect_log "volume create my-orkeon-workshop-worktrees"
expect_out "NVIDIA GPU found"
expect_last "run -it --init --name my-orkeon-workshop --gpus=all"
expect_last "-v cc-ollama:/home/node/.ollama/models"
expect_last "-v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude"
expect_last "-v my-orkeon-workshop-worktrees:/worktrees -e HARNESS_WORKTREE_ROOT=/worktrees"
expect_last "-v $HOME/Orkeon:/workspace"
expect_last "-e OLLAMA_DEFAULT_MODEL=qwen3:8b -e HARNESS_PROFILE=user -e DOCKER_MODE=socket orkeon-workshop"

case_name="first start without a GPU, the default folder"; setup; touch "$FAKE/i/orkeon-workshop"
start; expect_rc 0
expect_out "No usable NVIDIA GPU"; refute_log "pull"
refute_last "--gpus=all"; expect_last "-v $HOME/Orkeon:/workspace"

case_name="no model, no gpu, another name"; setup; touch "$FAKE/i/orkeon-workshop" "$FAKE/gpu"
start --no-model --no-gpu --name second --folder "$HOME/w2"; expect_rc 0
refute_log "--entrypoint true"; refute_last "OLLAMA_DEFAULT_MODEL"; refute_last "--gpus=all"
expect_last "--name second"; expect_last "-v second-claude:/home/node/.claude"

case_name="a folder of other files"; setup; mkdir -p "$HOME/docs"; touch "$HOME/docs/letter.txt"
start --folder "$HOME/docs"; expect_rc 1; expect_out "holds other files (letter.txt"; refute_log "run -it"

case_name="a workshop that has teams"; setup; touch "$FAKE/i/orkeon-workshop"; mkdir -p "$HOME/W/teams"; touch "$HOME/W/notes.md"
start --folder "$HOME/W"; expect_rc 0; expect_last "-v $HOME/W:/workspace"

# The folder rule with .git (D87): a project checkout is refused under user as other files, with
# the profile hint; this repository's checkout is told to take a source profile; a workshop that git
# versions - teams/, or nothing but README*/LICENSE* - is accepted as without .git.
case_name="a project checkout with the user profile"; setup; mkdir -p "$HOME/src/thing/.git" "$HOME/src/thing/src"; touch "$HOME/src/thing/README.md" "$HOME/src/thing/src/main.c"
start --folder "$HOME/src/thing"; expect_rc 1; expect_out "holds other files (src"; expect_out "--profile dev"; refute_log "run -it"

case_name="this repository's checkout with the user profile, by its files"; setup
mkdir -p "$HOME/src/ws/.git" "$HOME/src/ws/.devcontainer" "$HOME/src/ws/install" "$HOME/src/ws/docs"; touch "$HOME/src/ws/README.md" "$HOME/src/ws/install/start-workshop.ps1"
start --folder "$HOME/src/ws"; expect_rc 1; expect_out "is a git checkout: give it a profile made for one"; refute_out "holds other files"; refute_log "run -it"

case_name="this repository's checkout with the user profile, by its origin"; setup; mkdir -p "$HOME/src/ws/.git" "$HOME/src/ws/docs"; touch "$HOME/src/ws/README.md"
echo "git@github.com:Orkeon/orkeon-workshop.git" > "$FAKE/origin"
start --folder "$HOME/src/ws"; expect_rc 1; expect_out "is a git checkout: give it a profile made for one"; refute_log "run -it"

case_name="a git checkout with dev"; setup; touch "$FAKE/i/orkeon-workshop"; mkdir -p "$HOME/src/thing/.git" "$HOME/src/thing/src"; touch "$HOME/src/thing/src/main.c"
start --folder "$HOME/src/thing" --profile dev; expect_rc 0; expect_last "-e HARNESS_PROFILE=dev"

case_name="a workshop that git versions, with teams"; setup; touch "$FAKE/i/orkeon-workshop"; mkdir -p "$HOME/W/.git" "$HOME/W/teams"; touch "$HOME/W/README.md" "$HOME/W/.gitignore"
start --folder "$HOME/W"; expect_rc 0; expect_last "-v $HOME/W:/workspace"; expect_last "-e HARNESS_PROFILE=user"

case_name="a fresh git repository holding only README and LICENSE"; setup; touch "$FAKE/i/orkeon-workshop"; mkdir -p "$HOME/W/.git"; touch "$HOME/W/README.md" "$HOME/W/LICENSE" "$HOME/W/.gitattributes"
start --folder "$HOME/W"; expect_rc 0; expect_last "-v $HOME/W:/workspace"; expect_last "-e HARNESS_PROFILE=user"

case_name="a fresh git repository holding one more file"; setup; mkdir -p "$HOME/W/.git"; touch "$HOME/W/README.md" "$HOME/W/notes.txt"
start --folder "$HOME/W"; expect_rc 1; expect_out "holds other files (notes.txt"; refute_log "run -it"

case_name="a wrong profile"; setup
start --profile "<profile>"; expect_rc 2

case_name="an existing stopped container"; setup; container my-orkeon-workshop exited "/home/u/Orkeon:/workspace"
start; expect_rc 0; expect_last "start -ai my-orkeon-workshop"; refute_log "pull"

case_name="an existing running container"; setup; container my-orkeon-workshop running "/home/u/Orkeon:/workspace"
start; expect_rc 0; expect_last "exec -it --user node my-orkeon-workshop zsh"

# One line is one named container (D87): another --folder or --profile given with the name of an
# existing container is refused with 2; the same folder written otherwise, or the same profile, opens it.
case_name="an existing container, another --folder: refused"; setup; container my-orkeon-workshop running "/home/u/Orkeon:/workspace"
start --folder /elsewhere; expect_rc 2; expect_out "already works on /home/u/Orkeon, not on /elsewhere"
expect_out -- "--name <other-name>"; expect_out "docker rm my-orkeon-workshop"; refute_log "exec"; refute_log "start -ai"

case_name="an existing container, the same folder written differently"; setup; mkdir -p "$HOME/Orkeon"; ln -s "$HOME/Orkeon" "$HOME/ws-link"
container my-orkeon-workshop exited "$HOME/Orkeon:/workspace"
start --folder "$HOME/Orkeon/"; expect_rc 0; expect_last "start -ai my-orkeon-workshop"
start --folder "~/Orkeon"; expect_rc 0; expect_last "start -ai my-orkeon-workshop"
start --folder "$HOME/ws-link"; expect_rc 0; expect_last "start -ai my-orkeon-workshop"
mkdir -p "$FAKE/Orkeon"; container second exited "$FAKE/Orkeon:/workspace"   # the script runs in $FAKE: a relative folder
start --name second --folder "Orkeon"; expect_rc 0; expect_last "start -ai second"

case_name="an existing container, the same --profile"; setup; container my-orkeon-workshop exited "/home/u/Orkeon:/workspace"
container_env my-orkeon-workshop "HARNESS_PROFILE=dev" "DOCKER_MODE=socket"
start --profile dev; expect_rc 0; expect_last "start -ai my-orkeon-workshop"

case_name="an existing container, another --profile: refused"; setup; container my-orkeon-workshop exited "/home/u/Orkeon:/workspace"
container_env my-orkeon-workshop "HARNESS_PROFILE=user" "DOCKER_MODE=socket"
start --profile dev; expect_rc 2; expect_out "was created with the profile user, not dev"
expect_out -- "--name <other-name>"; expect_out "docker rm my-orkeon-workshop"; expect_out "workshop-profile dev"; refute_log "start -ai"

case_name="an existing container that records no profile"; setup; container my-orkeon-workshop exited "/home/u/Orkeon:/workspace"
start --profile dev; expect_rc 0; expect_out "records no profile"; expect_last "start -ai my-orkeon-workshop"

case_name="update"; setup
container my-orkeon-workshop running "/var/run/docker.sock:/var/run/docker-host.sock" "cc-ollama:/home/node/.ollama/models" "my-claude:/home/node/.claude" "/home/u/My Orkeon:/workspace"
printf '%s\n' PATH=/usr/bin NODE_VERSION=24 CLAUDE_CONFIG_DIR=/home/node/.claude OLLAMA_DEFAULT_MODEL=llama3.2 HARNESS_PROFILE=user ZAI_API_KEY=secret OTHER_KEY=x > "$FAKE/c/my-orkeon-workshop.env"
echo 1 > "$FAKE/c/my-orkeon-workshop.gpu"
printf '%s\n' PATH=/usr/bin NODE_VERSION=24 > "$FAKE/i/sha256:old"
EXTRA_ENV="ZAI_API_KEY=from-host" start --update; expect_rc 0
expect_log "pull ghcr.io/orkeon/orkeon-workshop:latest"; expect_log "stop my-orkeon-workshop"
expect_log "tag sha256:old orkeon-workshop:previous"; expect_log "rename my-orkeon-workshop my-orkeon-workshop-old"
expect_last "--gpus=all"; expect_last "-v my-claude:/home/node/.claude"; expect_last "-v /home/u/My Orkeon:/workspace"
expect_last "-e OLLAMA_DEFAULT_MODEL=llama3.2 -e HARNESS_PROFILE=user -e ZAI_API_KEY -e DOCKER_MODE=socket"
refute_last "secret"; refute_last "from-host"
expect_out "Not carried over (not set in this terminal): OTHER_KEY"; expect_out "--clean-up"

case_name="update of a Windows folder, model removed"; setup
container my-orkeon-workshop exited 'my-orkeon-workshop-claude:/home/node/.claude' 'C:\Users\you\Orkeon:/workspace'
start --update --no-model; expect_rc 0; refute_log "stop"
expect_last '-v C:\Users\you\Orkeon:/workspace'; refute_last "OLLAMA_DEFAULT_MODEL"; refute_last "--gpus=all"; refute_last "HARNESS_PROFILE"

case_name="update without the Claude Code volume"; setup; container my-orkeon-workshop exited "/home/u/Orkeon:/workspace"
start --update; expect_rc 1; expect_out "#without-the-claude-code-volume"; refute_log "pull"

case_name="update of a shared volume"; setup
container my-orkeon-workshop exited "shared-claude:/home/node/.claude" "/home/u/Orkeon:/workspace"
printf '%s\n' my-orkeon-workshop orkeon-dev > "$FAKE/ps"
start --update; expect_rc 1; expect_out "shared with orkeon-dev"; refute_log "pull"

case_name="update with an old container left"; setup
container my-orkeon-workshop exited "my-orkeon-workshop-claude:/home/node/.claude" "/home/u/Orkeon:/workspace"
container my-orkeon-workshop-old exited "my-orkeon-workshop-claude:/home/node/.claude" "/home/u/Orkeon:/workspace"
start --update; expect_rc 1; expect_out "--clean-up"; refute_log "pull"

case_name="update without a container"; setup
start --update; expect_rc 1; expect_out "without --update"

case_name="clean-up"; setup; touch "$FAKE/i/orkeon-workshop:previous"
container my-orkeon-workshop running "/home/u/Orkeon:/workspace"; container my-orkeon-workshop-old exited "/home/u/Orkeon:/workspace"
start --clean-up; expect_rc 0; expect_log "rm my-orkeon-workshop-old"; expect_log "rmi orkeon-workshop:previous"

case_name="clean-up without the new container"; setup; container my-orkeon-workshop-old exited "/home/u/Orkeon:/workspace"
start --clean-up; expect_rc 1; refute_log "rm my-orkeon-workshop-old"

case_name="dry run"; setup
start --dry-run --folder "$HOME/Orkeon"; expect_rc 0
[ ! -d "$HOME/Orkeon" ] || fail "folder created on a dry run"
refute_log "pull"; refute_log "volume create"; refute_log "run -it"
expect_out "+ docker pull ghcr.io/orkeon/orkeon-workshop:latest"; expect_out "+ docker volume create my-orkeon-workshop-claude"
expect_out "+ docker run -it --init --name my-orkeon-workshop"

case_name="an unknown option"; setup
start --gpu; expect_rc 2

if [ "$failures" -eq 0 ]; then echo "start-workshop.sh: every case passed"; else echo "start-workshop.sh: $failures failure(s)"; exit 1; fi
