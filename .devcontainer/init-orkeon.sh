#!/bin/bash
set -uo pipefail

# ══════════════════════════════════════════════════════════════════
# Orkeon runtime initialization for the Claude Code devcontainer
# ══════════════════════════════════════════════════════════════════
# 1. Writes the default Orkeon user config (local Ollama) when there is none.
# 2. Starts Ollama according to $OLLAMA_MODE:
#      local (default) -> `ollama serve` inside this container, as node.
#      host            -> reuse the host's Ollama: forward 127.0.0.1:11434 ->
#                         host.docker.internal:11434 (same trick as SonarQube),
#                         so localhost:11434 keeps working for the CLI and Orkeon.
#      off             -> start nothing.
# 3. Pulls $OLLAMA_DEFAULT_MODEL in the background when the models directory is
#    a volume (otherwise every new container would download it again).
#
# Called by the entrypoint (docker run) and by postStartCommand (devcontainer:
# the image entrypoint does not run there), and by orkeon-update.sh after an
# Ollama upgrade. Works as root or as node. Idempotent, never blocks startup,
# never exits non-zero.
#
# Usage:
#   init-orkeon.sh            # initialize
#   init-orkeon.sh --status   # show what is running
# ══════════════════════════════════════════════════════════════════

TARGET_USER="node"
MODE="${OLLAMA_MODE:-local}"
MODEL="${OLLAMA_DEFAULT_MODEL:-}"
API="http://127.0.0.1:11434"
HOST_UPSTREAM="host.docker.internal:11434"
LOG="/var/log/ollama.log"
SERVER_WAIT=60

log_info()    { printf "\033[1;34m[ORKEON-INIT]\033[0m  %s\n" "$*"; }
log_success() { printf "\033[1;32m[ORKEON-INIT]\033[0m  %s\n" "$*"; }
log_warn()    { printf "\033[1;33m[ORKEON-INIT]\033[0m  %s\n" "$*"; }

# Everything user-visible (config, server, models) belongs to the target user. AS_USER is a
# command prefix, not a function: a function launched with `&` would leave a waiting
# subshell behind every detached process.
if [ "$(id -u)" -eq 0 ]; then
    AS_USER=(gosu "$TARGET_USER")
    USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
else
    AS_USER=()
    USER_HOME="$HOME"
fi
MODELS_DIR="${OLLAMA_MODELS:-$USER_HOME/.ollama/models}"

# A model name without a tag means ":latest" for Ollama.
case "$MODEL" in
    ""|*:*) ;;
    *) MODEL="$MODEL:latest" ;;
esac

server_ready() { curl -fsS -m 2 "$API/api/version" >/dev/null 2>&1; }

model_present() {
    curl -fsS -m 5 "$API/api/tags" 2>/dev/null | jq -e --arg m "$MODEL" '.models[]? | select(.name == $m)' >/dev/null 2>&1
}

ensure_log() {
    if [ "$(id -u)" -eq 0 ]; then
        touch "$LOG" 2>/dev/null && chown "$TARGET_USER:$TARGET_USER" "$LOG" 2>/dev/null
    fi
    [ -w "$LOG" ] || "${AS_USER[@]}" test -w "$LOG" || LOG="/tmp/ollama.log"
}

# ── Orkeon user config ───────────────────────────────────────────────────────
init_orkeon_config() {
    command -v orkeon >/dev/null 2>&1 || return 0
    [ -n "$MODEL" ] || return 0
    [ "$MODE" != "off" ] || return 0

    local cfg="$USER_HOME/.config/Orkeon/appsettings.json"
    [ -f "$cfg" ] && return 0

    if "${AS_USER[@]}" timeout 60 orkeon init --provider ollama --model "$MODEL" --no-probe </dev/null >/dev/null 2>&1 \
       && [ -f "$cfg" ]; then
        # `orkeon init` writes Llm.Model and Llm.BaseUrl only. A local model needs more than
        # the 30 s default timeout (600 s is upstream's preset for models that think before
        # they answer, as qwen3 does), a bound on the silence between two streamed chunks
        # (Llm:StreamIdleSeconds, 120 s: a streamed call that stops answering fails instead of
        # hanging, D46; Orkeon main ce9ec1f, LLM-12), and one request at a time (absent means
        # unlimited). BaseUrl must stay: without it, a `qwen*` model name is routed to the Qwen
        # cloud provider.
        "${AS_USER[@]}" sh -c 'jq ".Llm.TimeoutSeconds = 600 | .Llm.StreamIdleSeconds = 120 | .RateLimiting = ((.RateLimiting // {}) + {MaxConcurrentRequests: 1, QueueLimit: 32})" "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ "$cfg" \
            || log_warn "Could not complete $cfg (timeout / stream idle / rate limiting)"
        log_success "Orkeon config written: $cfg (Ollama, model $MODEL)"
    else
        log_warn "orkeon init failed — run it by hand: orkeon init --provider ollama --model $MODEL"
    fi
}

# A streamed answer that stops arriving is a failed call, not a hang: at each start, a settings file
# whose base URL is on this machine or on the Docker host and that sets no Llm.StreamIdleSeconds (a
# file written by `orkeon init`, or by an older image) gets 120 (D46). A value set by hand is kept,
# whatever it is. The key keeps the casing of the Llm section the file already uses.
complete_local_stream_idle() {
    local cfg="$USER_HOME/.config/Orkeon/appsettings.json" filter
    [ -f "$cfg" ] || return 0
    filter='
      def key($k): [keys_unsorted[] | select(ascii_downcase == $k)] | .[0];
      def ci($k): if type == "object" then (key($k) as $real | if $real == null then null else .[$real] end) else null end;
      (ci("llm") | ci("baseurl") // "" | if type == "string" then . else "" end) as $url
      | ($url | test("^\\s*([a-z][a-z0-9+.-]*://)?([^/@]*@)?(localhost|127(\\.[0-9]{1,3}){3}|\\[::1\\]|0\\.0\\.0\\.0|host\\.docker\\.internal)(:[0-9]+)?(/|\\s*$)"; "i")) as $local
      | (ci("llm") | if type == "object" then . else null end) as $llm
      | if ($local and $llm != null and ($llm | ci("streamidleseconds")) == null) then
          (key("llm")) as $lk | .[$lk] = ($llm + {StreamIdleSeconds: 120})
        else empty end'
    "${AS_USER[@]}" jq -e "$filter" "$cfg" >/dev/null 2>&1 || return 0
    if "${AS_USER[@]}" sh -c 'jq "$2" "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ "$cfg" "$filter"; then
        log_success "Orkeon config: Llm.StreamIdleSeconds = 120 for the local model (a streamed answer that stops arriving fails instead of hanging) in $cfg"
    else
        log_warn "Could not complete Llm.StreamIdleSeconds in $cfg"
    fi
}

# A local model serves one request at a time: concurrent calls (a parallel crew, the manager and a
# worker) saturate the GPU and slow every request down. Orkeon reads RateLimiting.MaxConcurrentRequests
# (absent or 0 = unlimited) and queues the other calls, up to RateLimiting.QueueLimit (default 5, beyond
# which a call is refused). At each start, a settings file whose base URL is on this machine or on the
# Docker host and that sets no limit - MaxConcurrentRequests absent, or 0 and below, which Orkeon reads as
# unlimited - gets 1 (a file rewritten by `orkeon init`, or by an older image), with QueueLimit 32 when it
# has none. A limit of 1 or more set by hand is kept. The keys keep the casing the file already uses (two
# spellings of one key would stop Orkeon).
complete_local_concurrency() {
    local cfg="$USER_HOME/.config/Orkeon/appsettings.json" filter before
    [ -f "$cfg" ] || return 0
    filter='
      def key($k): [keys_unsorted[] | select(ascii_downcase == $k)] | .[0];
      def ci($k): if type == "object" then (key($k) as $real | if $real == null then null else .[$real] end) else null end;
      (ci("llm") | ci("baseurl") // "" | if type == "string" then . else "" end) as $url
      | ($url | test("^\\s*([a-z][a-z0-9+.-]*://)?([^/@]*@)?(localhost|127(\\.[0-9]{1,3}){3}|\\[::1\\]|0\\.0\\.0\\.0|host\\.docker\\.internal)(:[0-9]+)?(/|\\s*$)"; "i")) as $local
      | (ci("ratelimiting") | if type == "object" then . else {} end) as $rl
      | ($rl | ci("maxconcurrentrequests") | if type == "string" then (try tonumber catch null) elif type == "number" then . else null end) as $limit
      | ($limit == null or $limit <= 0) as $unlimited
      | if ($local and ($unlimited or ($limit == 1 and ($rl | ci("queuelimit")) == null))) then
          (key("ratelimiting") // "RateLimiting") as $rk
          | (($rl | key("maxconcurrentrequests")) // "MaxConcurrentRequests") as $mk
          | .[$rk] = ($rl + (if $unlimited then {($mk): 1} else {} end) + (if ($rl | ci("queuelimit")) == null then {QueueLimit: 32} else {} end))
        else empty end'
    "${AS_USER[@]}" jq -e "$filter" "$cfg" >/dev/null 2>&1 || return 0
    before=$("${AS_USER[@]}" jq -r '[to_entries[] | select(.key | ascii_downcase == "ratelimiting") | .value | objects | to_entries[] | select(.key | ascii_downcase == "maxconcurrentrequests") | .value | tostring] | .[0] // "absent"' "$cfg" 2>/dev/null)
    if "${AS_USER[@]}" sh -c 'jq "$2" "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ "$cfg" "$filter"; then
        if [ "${before:-absent}" != 1 ]; then
            log_success "Orkeon config: one request at a time for the local model — RateLimiting.MaxConcurrentRequests = 1 (was ${before:-absent}), QueueLimit 32 unless set, in $cfg"
        else
            log_success "Orkeon config: RateLimiting.QueueLimit = 32 beside MaxConcurrentRequests 1 in $cfg"
        fi
    else
        log_warn "Could not complete RateLimiting in $cfg"
    fi
}

# ── Ollama: local server ─────────────────────────────────────────────────────
start_local_server() {
    if ! command -v ollama >/dev/null 2>&1; then
        log_warn "ollama is not installed — run: orkeon-update --ollama"
        return 1
    fi
    if server_ready; then
        log_info "Ollama already answering on $API"
        return 0
    fi
    # A server process, or its respawn loop between two attempts (pattern anchored so that it
    # cannot match an unrelated command line that merely quotes it).
    if pgrep -x ollama >/dev/null 2>&1 || pgrep -f '^sh -c while true; do OLLAMA_NOPRUNE=1 ollama serve' >/dev/null 2>&1; then
        log_info "Ollama server is starting"
        return 0
    fi

    "${AS_USER[@]}" mkdir -p "$MODELS_DIR" 2>/dev/null
    # setsid: as a plain background job the server would receive the first Ctrl+C typed at the
    # main shell prompt. Respawn loop like the socat forwarders of the entrypoint: restarting
    # the server (after an upgrade) is just killing it.
    # OLLAMA_NOPRUNE: several containers may share the models volume, and pruning at startup
    # would delete the partial downloads of another instance.
    "${AS_USER[@]}" setsid sh -c 'while true; do OLLAMA_NOPRUNE=1 ollama serve; sleep 2; done' \
        </dev/null >>"$LOG" 2>&1 &
    log_info "Ollama server started (mode: local, logs: $LOG)"
}

# ── Ollama: forward to the host ──────────────────────────────────────────────
start_host_forwarder() {
    if ! getent hosts host.docker.internal >/dev/null 2>&1; then
        log_warn "host.docker.internal does not resolve — add --add-host=host.docker.internal:host-gateway"
    fi
    if pgrep -f '^socat TCP-LISTEN:11434' >/dev/null 2>&1; then
        log_info "Ollama forwarder already running"
        return 0
    fi
    setsid sh -c "while true; do socat TCP-LISTEN:11434,fork,reuseaddr,bind=127.0.0.1 TCP:$HOST_UPSTREAM; sleep 2; done" \
        </dev/null >>"$LOG" 2>&1 &
    log_info "Ollama forwarder started (127.0.0.1:11434 -> $HOST_UPSTREAM)"
}

# The host's models are not ours to manage: only say when the default one is missing there.
report_host_model() {
    [ -n "$MODEL" ] || return 0
    for _ in 1 2 3; do
        server_ready && break
        sleep 1
    done
    if ! server_ready; then
        log_warn "No Ollama answering on $HOST_UPSTREAM (the forwarder keeps trying)"
    elif ! model_present; then
        log_warn "$MODEL is not available on the host's Ollama: pull it there (ollama pull $MODEL)"
        log_warn "or choose another default model with -e OLLAMA_DEFAULT_MODEL=<name>"
    fi
}

# ── Default model ────────────────────────────────────────────────────────────
# Runs detached (see schedule_model_pull): waits for the server, then pulls under a lock
# kept on the models volume so that containers sharing it download the model once.
pull_model_worker() {
    local waited=0
    until server_ready; do
        waited=$((waited + 2))
        [ "$waited" -ge "$SERVER_WAIT" ] && { echo "[pull] Ollama did not answer within ${SERVER_WAIT}s — model not pulled"; return 0; }
        sleep 2
    done
    (
        flock 9
        if model_present; then
            echo "[pull] $MODEL is already present"
            exit 0
        fi
        echo "[pull] pulling $MODEL ($(date -u +%H:%M:%SZ))..."
        if curl -fsS -m 14400 -X POST "$API/api/pull" -d "{\"model\":\"$MODEL\",\"stream\":false}" | grep -q '"success"'; then
            echo "[pull] $MODEL ready ($(date -u +%H:%M:%SZ))"
        else
            echo "[pull] pulling $MODEL failed — retry with: ollama pull $MODEL"
        fi
    ) 9>"$MODELS_DIR/.pull.lock"
}

schedule_model_pull() {
    [ -n "$MODEL" ] || return 0
    [ "${OLLAMA_AUTO_PULL:-}" != "0" ] || return 0
    if server_ready && model_present; then
        return 0
    fi
    if ! mountpoint -q "$MODELS_DIR" 2>/dev/null && [ "${OLLAMA_AUTO_PULL:-}" != "1" ]; then
        log_warn "$MODELS_DIR is not a volume: $MODEL is not pulled automatically,"
        log_warn "every new container would download it again. Start the container with"
        log_warn "  -v cc-ollama:$MODELS_DIR    or pull it once by hand: ollama pull $MODEL"
        return 0
    fi
    "${AS_USER[@]}" setsid bash "$0" --pull-model </dev/null >>"$LOG" 2>&1 &
    log_info "Pulling $MODEL in the background if it is missing (follow: tail -f $LOG)"
}

# ── Status ───────────────────────────────────────────────────────────────────
show_status() {
    echo "mode      : $MODE (default model: ${MODEL:-none})"
    if server_ready; then
        echo "server    : up on $API ($(curl -fsS -m 2 "$API/api/version" 2>/dev/null | jq -r '.version // "?"' 2>/dev/null))"
    else
        echo "server    : not answering on $API"
    fi
    if [ "$MODE" = "local" ]; then
        local compute
        compute=$(grep -a 'inference compute' "$LOG" 2>/dev/null | tail -1 | grep -oE 'library=[a-zA-Z0-9_]+' | head -1)
        echo "compute   : ${compute:-unknown (see $LOG)}"
        if mountpoint -q "$MODELS_DIR" 2>/dev/null; then
            echo "models    : $MODELS_DIR (volume)"
        else
            echo "models    : $MODELS_DIR (container layer, not a volume)"
        fi
    fi
    if server_ready; then
        echo "available : $(curl -fsS -m 5 "$API/api/tags" 2>/dev/null | jq -r '[.models[]?.name] | join(", ")' 2>/dev/null)"
        echo "loaded    : $(curl -fsS -m 5 "$API/api/ps" 2>/dev/null | jq -r '[.models[]? | "\(.name) (\(if (.size_vram // 0) == 0 then "CPU" elif .size_vram >= .size then "GPU" else "\(.size_vram * 100 / .size | floor)% GPU" end), context \(.context_length // "?"))"] | join(", ")' 2>/dev/null)"
    fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
ensure_log

case "${1:-}" in
    --status)     show_status; exit 0 ;;
    --pull-model) pull_model_worker; exit 0 ;;
    --help|-h)    echo "Usage: $(basename "$0") [--status]"; exit 0 ;;
    "")           ;;
    *)            echo "Unknown option: $1"; exit 0 ;;
esac

init_orkeon_config
complete_local_stream_idle
complete_local_concurrency

case "$MODE" in
    local)
        if start_local_server; then
            schedule_model_pull
        fi
        ;;
    host)
        start_host_forwarder
        report_host_model
        ;;
    off)
        log_info "OLLAMA_MODE=off — Ollama not started"
        ;;
    *)
        log_warn "Unknown OLLAMA_MODE='$MODE' (expected local, host or off) — Ollama not started"
        ;;
esac

exit 0
