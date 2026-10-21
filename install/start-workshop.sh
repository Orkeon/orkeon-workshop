#!/usr/bin/env bash
# start-workshop.sh — start Orkeon Workshop on your computer (Linux), in one line (D86).
#
# Typed in a terminal of your computer, never in the container:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop [options]
#
# The first time, it checks Docker, asks for the folder of your workshop, downloads the image, tries
# the NVIDIA GPU and creates the container with the command of Install "Starting by hand" (D85): its
# two volumes <name>-claude and <name>-worktrees created when missing, cc-ollama for the models. After
# that, the same line opens the container again: started when stopped, a second terminal when it is
# running. One line is one named container (D87): --name says which, and a --folder or --profile given
# with it that differs from the container's (its bind on /workspace, its HARNESS_PROFILE) is refused
# with exit 2 rather than silently ignored. --update moves the container to the latest image as
# Updating "By hand" does — the old one kept as <name>-old until --clean-up — and --clean-up removes it
# with the previous image.
#
#   --folder <path>    the folder mounted on /workspace (asked, default ~/Orkeon)
#   --name <name>      the container (default my-orkeon-workshop)
#   --profile <name>   the folder's first profile (default user, for a folder of teams; dev, release,
#                      docs, contrib, all for a git checkout to work on)
#   --model <name>     the local model downloaded at the first start (default qwen3:8b)
#   --no-model         no local model
#   --no-gpu           do not try the GPU
#   --update           move the container to the latest image
#   --clean-up         remove <name>-old and the previous image, once the updated container works
#   --dry-run          print the commands that change something instead of running them
#
# Its literals — the image and its tag, the container and volume names, the docker run options, the
# messages quoted in the pages — change together with start-workshop.ps1, README.md ("Get started"),
# docs/getting-started/install.md ("The script's options", "Starting by hand"), docs/guides/updating.md
# ("By hand"), docs/concepts/workshop.md (the folder rule), docs/reference/troubleshooting.md ("Installing
# and starting"), docs/discover-with-claude.md and their French mirrors. Exit: 0 done, 1 refused or
# failed, 2 wrong option or a named container that works elsewhere.
set -euo pipefail

IMAGE_URL="ghcr.io/orkeon/orkeon-workshop:latest"
IMAGE="orkeon-workshop"
DOCS="https://orkeon.github.io/orkeon-workshop"

name="my-orkeon-workshop"
folder=""
folder_given=false
profile="user"
profile_given=false
model="qwen3:8b"
model_given=false
gpu=true
action=start
dry_run=false

say() { printf '[workshop] %s\n' "$*"; }
die() { printf '[workshop] %s\n' "$*" >&2; exit 1; }
usage() {
    cat <<'EOT'
start-workshop [--folder <path>] [--name <name>] [--profile <name>] [--model <name> | --no-model]
               [--no-gpu] [--update | --clean-up] [--dry-run]
The first time, it creates the container on your folder; then it opens it again. --update moves it
to the latest image, --clean-up removes the old one. Guide: https://orkeon.github.io/orkeon-workshop/
EOT
}

while [ $# -gt 0 ]; do
    case "$1" in
        --folder)   [ $# -ge 2 ] || { say "--folder needs a path"; exit 2; }; folder="$2"; folder_given=true; shift 2 ;;
        --name)     [ $# -ge 2 ] || { say "--name needs a name"; exit 2; }; name="$2"; shift 2 ;;
        --profile)  [ $# -ge 2 ] || { say "--profile needs a name"; exit 2; }; profile="$2"; profile_given=true; shift 2 ;;
        --model)    [ $# -ge 2 ] || { say "--model needs a name"; exit 2; }; model="$2"; model_given=true; shift 2 ;;
        --no-model) model=""; model_given=true; shift ;;
        --no-gpu)   gpu=false; shift ;;
        --update)   action=update; shift ;;
        --clean-up) action=clean-up; shift ;;
        --dry-run)  dry_run=true; shift ;;
        -h|--help)  usage; exit 0 ;;
        *)          say "unknown option: $1 (--help lists them)"; exit 2 ;;
    esac
done

[[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || { say "--name: letters, digits, '.', '_' and '-' only"; exit 2; }
[[ "$profile" =~ ^(custom:[a-z][a-z0-9-]*(,[a-z][a-z0-9-]*)*|[a-z][a-z0-9-]*)$ ]] || { say "--profile: not a profile name: $profile"; exit 2; }

# A command that changes something: printed under --dry-run, run otherwise.
run() {
    if [ "$dry_run" = true ]; then printf '+ %s\n' "$*"; else "$@"; fi
}
run_quiet() {
    if [ "$dry_run" = true ]; then printf '+ %s\n' "$*"; else "$@" >/dev/null; fi
}
# The last command, the one that takes the terminal over (the container's own).
hand_over() {
    if [ "$dry_run" = true ]; then printf '+ %s\n' "$*"; exit 0; fi
    exec "$@"
}

# ── 1. Docker ───────────────────────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
    die "Docker is not installed. Install Docker Engine (https://docs.docker.com/engine/install/) or Docker Desktop, then type this line again."
fi
if ! info_err="$(docker info 2>&1 >/dev/null)"; then
    case "$info_err" in
        *"permission denied"*)
            die "Docker refuses your user. Type: sudo usermod -aG docker \$USER — then log out, log in again, and type this line again." ;;
        *)
            die "Docker does not answer: start it (sudo systemctl start docker, or open Docker Desktop and wait for 'Engine running'), then type this line again." ;;
    esac
fi

state_of() { docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null || true; }
# The value of one variable given at the container's docker run (HARNESS_PROFILE, OLLAMA_DEFAULT_MODEL).
env_of() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" 2>/dev/null | sed -n "s/^$2=//p" | head -n 1; }
# A folder as it compares: ~ expanded, made absolute, its trailing slash dropped and, when it exists,
# its links resolved - Docker records the path as it was given.
normal_folder() {
    local p="$1"
    case "$p" in "~") p="$HOME" ;; "~/"*) p="$HOME/${p#"~/"}" ;; esac
    case "$p" in /*) ;; *) p="$PWD/$p" ;; esac
    p="${p%/}"; [ -n "$p" ] || p=/
    [ ! -d "$p" ] || p="$(cd "$p" 2>/dev/null && pwd -P)" || true
    printf '%s\n' "$p"
}
same_folder() { [ "$(normal_folder "$1")" = "$(normal_folder "$2")" ]; }
# The git checkout of this repository: its own files, or its origin (git on this computer, if any).
is_this_repository() {
    { [ -d "$1/.devcontainer" ] && [ -f "$1/install/start-workshop.ps1" ]; } && return 0
    command -v git >/dev/null 2>&1 || return 1
    git -C "$1" remote get-url origin 2>/dev/null | grep -qiE 'github\.com[:/]Orkeon/orkeon-workshop(\.git)?/?$'
}
# The source of a container's bind on $2 (/workspace, /home/node/.claude), as it was given.
bind_source() {
    local line
    while IFS= read -r line; do
        case "$line" in
            *":$2"|*":$2:"*) line="${line%":$2"*}"; printf '%s\n' "$line"; return 0 ;;
        esac
    done < <(docker inspect -f '{{range .HostConfig.Binds}}{{println .}}{{end}}' "$1" 2>/dev/null)
}
pull_image() {
    say "Downloading the image (about 19 GB the first time: it takes a while)..."
    run docker pull "$IMAGE_URL" || die "The download failed: check your internet connection, then type this line again."
    run docker tag "$IMAGE_URL" "$IMAGE"
}
create_volumes() {
    local v
    for v in "$@"; do
        docker volume inspect "$v" >/dev/null 2>&1 || run_quiet docker volume create "$v"
    done
}
# The docker run of Install "Starting by hand"; $claude_volume, $folder, $gpu, $model and the
# extra -e set before. $1: the profile to pass as HARNESS_PROFILE, none when empty.
start_new() {
    local args=(run -it --init --name "$name")
    [ "$gpu" = true ] && args+=(--gpus=all)
    args+=(--cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway
        -v /var/run/docker.sock:/var/run/docker-host.sock
        -v cc-ollama:/home/node/.ollama/models
        -v "$claude_volume:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude
        -v "$name-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees
        -v "$folder:/workspace")
    [ -z "$model" ] || args+=(-e "OLLAMA_DEFAULT_MODEL=$model")
    [ -z "$1" ] || args+=(-e "HARNESS_PROFILE=$1")
    args+=("${extra_env[@]}" -e DOCKER_MODE=socket "$IMAGE")
    hand_over docker "${args[@]}"
}
extra_env=()

# ── --clean-up ──────────────────────────────────────────────────────────────────────────────
if [ "$action" = clean-up ]; then
    [ -n "$(state_of "$name")" ] || die "No container named $name: nothing removed, so that you keep $name-old."
    if [ -n "$(state_of "$name-old")" ]; then run_quiet docker rm "$name-old"; say "Removed the old container $name-old."; fi
    if docker image inspect "$IMAGE:previous" >/dev/null 2>&1; then run_quiet docker rmi "$IMAGE:previous"; say "Removed the previous image."; fi
    say "Clean."
    exit 0
fi

state="$(state_of "$name")"

# ── --update ────────────────────────────────────────────────────────────────────────────────
if [ "$action" = update ]; then
    [ -n "$state" ] || die "No container named $name: type the line without --update to create it."
    [ -z "$(state_of "$name-old")" ] || die "$name-old is still there, from an earlier update: once $name works, type the line with --clean-up, then --update again."
    folder="$(bind_source "$name" /workspace)"
    [ -n "$folder" ] || die "$name has no folder on /workspace: update it by hand ($DOCS/docs/guides/updating.html#by-hand)."
    claude_volume="$(bind_source "$name" /home/node/.claude)"
    case "$claude_volume" in
        ""|/*|*\\*|*:*)
            die "$name keeps Claude Code's state inside itself, not on a volume: update it by hand ($DOCS/docs/guides/updating.html#without-the-claude-code-volume)." ;;
    esac
    others="$(docker ps -a --filter "volume=$claude_volume" --format '{{.Names}}' | grep -vx "$name" || true)"
    [ -z "$others" ] || die "The volume $claude_volume is shared with $(echo "$others" | paste -sd ' ' -): see $DOCS/docs/guides/updating.html#one-claude-code-volume-per-container."
    [ "$model_given" = true ] || model="$(env_of "$name" OLLAMA_DEFAULT_MODEL)"
    # The profile the container was created with, carried over as its record: the folder's own
    # profile file wins over it in the container, as it did (D87).
    recorded_profile="$(env_of "$name" HARNESS_PROFILE)"
    [ "$gpu" = false ] || [ "$(docker inspect -f '{{len .HostConfig.DeviceRequests}}' "$name")" != 0 ] || gpu=false
    # The variables given at docker run beyond those above: passed on by name when this terminal
    # has them (a key set on your computer), named otherwise. Never their values.
    old_image="$(docker inspect -f '{{.Image}}' "$name")"
    image_env="$(docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$old_image" 2>/dev/null | sed 's/=.*//' || true)"
    missing=()
    while IFS= read -r var; do
        case "$var" in
            ""|CLAUDE_CONFIG_DIR|HARNESS_WORKTREE_ROOT|OLLAMA_DEFAULT_MODEL|HARNESS_PROFILE|DOCKER_MODE) continue ;;
        esac
        grep -qxF "$var" <<<"$image_env" && continue
        if [ -n "${!var+set}" ]; then extra_env+=(-e "$var"); else missing+=("$var"); fi
    done < <(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$name" | sed 's/=.*//')

    pull_image
    if [ "$state" = running ]; then say "Stopping $name..."; run_quiet docker stop "$name"; fi
    run docker tag "$old_image" "$IMAGE:previous"
    run docker rename "$name" "$name-old"
    create_volumes "$name-worktrees"
    say "The old container is kept as $name-old. When the new one works, type the same line with --clean-up."
    say "To go back instead: docker rm -f $name; docker rename $name-old $name; docker tag $IMAGE:previous $IMAGE; docker start -ai $name"
    [ ${#missing[@]} -eq 0 ] || say "Not carried over (not set in this terminal): ${missing[*]} — give a key again with: workshop --secret <NAME>"
    say "Starting $name on the new image, folder $folder..."
    start_new "$recorded_profile"
fi

# ── An existing container: open it ─────────────────────────────────────────────────────────
# One line is one named container (D87): --folder or --profile given with the name of a container
# that works elsewhere, or on another profile, is refused - never ignored.
if [ -n "$state" ]; then
    current="$(bind_source "$name" /workspace)"
    if [ "$folder_given" = true ] && [ -n "$current" ] && ! same_folder "$folder" "$current"; then
        say "$name already works on $current, not on $folder: one line opens one named container, whatever --folder says."
        say "For another folder, give it another name: --name <other-name> --folder \"$folder\" - or remove this container first: docker rm $name (your folder and the volumes are kept)."
        exit 2
    fi
    if [ "$profile_given" = true ]; then
        recorded="$(env_of "$name" HARNESS_PROFILE)"
        if [ -z "$recorded" ]; then
            say "$name records no profile: --profile $profile is not checked (in the container, 'workshop-profile' shows the profile in force)."
        elif [ "$profile" != "$recorded" ]; then
            say "$name was created with the profile $recorded, not $profile: one line opens one named container, whatever --profile says."
            say "For another profile, give it another name: --name <other-name> --profile $profile - or remove this container first: docker rm $name (your folder and the volumes are kept) - or change it inside: workshop-profile $profile."
            exit 2
        fi
    fi
    if [ "$state" = running ]; then
        say "$name is running: opening a second terminal in it (type 'workshop' to open Claude Code)."
        hand_over docker exec -it --user node "$name" zsh
    fi
    say "Starting $name (then type 'workshop' to open Claude Code)..."
    hand_over docker start -ai "$name"
fi

# ── A new container ─────────────────────────────────────────────────────────────────────────
if [ -z "$folder" ]; then
    default="$HOME/Orkeon"
    if [ -r /dev/tty ] && [ -t 1 ]; then
        printf '[workshop] The folder of your workshop, where your teams live [%s]: ' "$default"
        read -r folder </dev/tty || folder=""
    fi
    [ -n "$folder" ] || folder="$default"
fi
# shellcheck disable=SC2088   # a tilde typed at the prompt, which no shell expanded
case "$folder" in "~") folder="$HOME" ;; "~/"*) folder="$HOME/${folder#"~/"}" ;; esac
case "$folder" in /*) ;; *) folder="$PWD/$folder" ;; esac
folder="${folder%/}"

# The folder the harness accepts (sync-harness.sh is_workshop, D87): missing, empty, a workshop -
# one that holds teams/ or the harness, or nothing but the ordinary files of a git repository
# (README*, LICENSE*) next to its .git - whether git versions it or not; or a git checkout to work
# on, with a profile made for one. The checkout of this repository is told so. Refused here, before
# a container is created on it.
visible=()
git_here=false; [ ! -e "$folder/.git" ] || git_here=true
for entry in "$folder"/*; do
    [ -e "$entry" ] || continue
    case "${entry##*/}" in desktop.ini|Thumbs.db|lost+found) continue ;; esac
    if [ "$git_here" = true ]; then case "${entry##*/}" in [Rr][Ee][Aa][Dd][Mm][Ee]*|[Ll][Ii][Cc][Ee][Nn][CcSs][Ee]*) continue ;; esac; fi
    visible+=("${entry##*/}")
done
if [ "$git_here" = true ] && [ "$profile" = user ] && is_this_repository "$folder"; then
    die "$folder is a git checkout: give it a profile made for one, for instance --profile dev (or release, docs, contrib)."
elif [ -d "$folder/teams" ] || [ -f "$folder/.claude/.harness-manifest" ] || [ ${#visible[@]} -eq 0 ]; then
    :
elif [ "$git_here" = true ] && [ "$profile" != user ]; then
    :
elif [ "$git_here" = true ]; then
    die "$folder holds other files (${visible[*]:0:3}...): choose an empty folder, or the folder that holds your teams/. A git checkout you work on takes a profile made for one: --profile dev (or release, docs, contrib)."
else
    die "$folder holds other files (${visible[*]:0:3}...): choose an empty folder, or the folder that holds your teams/."
fi
if [ ! -d "$folder" ]; then
    say "Creating the folder $folder"
    run mkdir -p "$folder"
fi
if [ "$(id -u)" != 1000 ]; then
    say "Your user id is $(id -u), the container writes as 1000: if the container cannot write in the folder, type"
    say "  sudo setfacl -R -m u:1000:rwX -m d:u:1000:rwX \"$folder\""
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    root="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true)"
    free_kb="$(df -Pk "$root" 2>/dev/null | awk 'NR==2 {print $4}' || true)"
    if [ -n "$free_kb" ] && [ "$free_kb" -lt $((30 * 1024 * 1024)) ]; then
        say "Warning: $((free_kb / 1024 / 1024)) GB free for Docker, about 25 GB are needed."
    fi
    pull_image
fi

if [ "$gpu" = true ] && [ "$dry_run" = true ] && ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    say "(dry run: the image is not there, the GPU is not tried)"
elif [ "$gpu" = true ]; then
    if docker run --rm --gpus=all --entrypoint true "$IMAGE" >/dev/null 2>&1; then
        say "NVIDIA GPU found: the local models will use it."
    else
        gpu=false
        say "No usable NVIDIA GPU: the local models will run on the processor, more slowly."
    fi
fi

claude_volume="$name-claude"
create_volumes "$claude_volume" "$name-worktrees"
say "Creating $name on $folder (profile $profile). The first start takes a minute or two."
start_new "$profile"
