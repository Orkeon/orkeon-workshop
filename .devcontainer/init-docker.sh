#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# init-docker.sh — Docker inside the Orkeon Workshop container, as $DOCKER_MODE says
# ══════════════════════════════════════════════════════════════════════════════
# DOCKER_MODE=dind   -> start a Docker daemon inside this container (the default; needs
#                       --privileged, and a volume on /var/lib/docker to keep its images).
# DOCKER_MODE=socket -> reuse the host's daemon through its socket, bind-mounted on
#                       /var/run/docker-host.sock; never start dockerd.
# DOCKER_MODE=none   -> no Docker at all.
# The mode is EXPLICIT (-e DOCKER_MODE on `docker run`, containerEnv in a devcontainer.json),
# never probed, so a stale socket cannot be misread.
#
# Runs as ROOT: the entrypoint of a `docker run` container calls it, and so does the
# postStartCommand of the DinD and Host Socket VS Code configurations
# (`sudo --preserve-env=DOCKER_MODE`), where the image entrypoint does not run. It never fails
# the start-up: when something goes wrong, Docker is unavailable and the log says why.
# ══════════════════════════════════════════════════════════════════════════════
set -u

DOCKER_MODE="${DOCKER_MODE:-dind}"
echo "[docker] Docker mode: $DOCKER_MODE"

if [ "$(id -u)" != "0" ]; then
    echo "[docker] WARNING: init-docker.sh must run as root (sudo --preserve-env=DOCKER_MODE init-docker.sh); Docker left as it is."
    exit 0
fi

case "$DOCKER_MODE" in
none)
    echo "[docker] No Docker in this container (DOCKER_MODE=none)."
    ;;

socket)
    # ── Host socket (Docker-outside-of-Docker) ───────────────────────────────
    # The host /var/run/docker.sock is bind-mounted to a SIDE path so we never
    # chmod/chgrp the host inode itself.
    HOST_SOCK=/var/run/docker-host.sock

    if [ ! -S "$HOST_SOCK" ]; then
        echo "[docker] ============================================================"
        echo "[docker] DOCKER_MODE=socket but $HOST_SOCK is missing / not a socket."
        echo "[docker] Windows: enable Docker Desktop > Settings > Resources >"
        echo "[docker]   WSL Integration for this distro, and use the WSL2 backend"
        echo "[docker]   (the Hyper-V backend is not supported for socket mode)."
        echo "[docker] Linux/WSL: ensure /var/run/docker.sock exists on the host."
        echo "[docker] Docker will be unavailable in this session."
        echo "[docker] ============================================================"
    elif ! timeout 5 docker -H "unix://$HOST_SOCK" info >/dev/null 2>&1; then
        echo "[docker] WARNING: $HOST_SOCK is present but the host Docker daemon is"
        echo "[docker] not responding. Is Docker Desktop running / WSL integration on?"
    else
        SG="$(stat -c '%g' "$HOST_SOCK" 2>/dev/null || echo 0)"
        DG="$(getent group docker | cut -d: -f3)"
        if [ -n "$SG" ] && [ "$SG" != "0" ] && [ "$SG" != "$DG" ] \
           && ! getent group | awk -F: '{print $3}' | grep -qx "$SG"; then
            # Host socket has a real, non-conflicting GID (typical Linux/WSL): align
            # the container 'docker' group to it and point /var/run/docker.sock at it.
            echo "[docker] Aligning container 'docker' group to host socket GID $SG"
            groupmod -g "$SG" docker 2>/dev/null || groupadd -g "$SG" docker 2>/dev/null || true
            usermod -aG docker node 2>/dev/null || true
            ln -sf "$HOST_SOCK" /var/run/docker.sock   # symlink only — never touch the host inode
        else
            # GID 0 (typical Windows Docker Desktop: root:root) or a GID collision:
            # publish a fresh node-owned socket via socat. Self-respawning.
            echo "[docker] Host socket GID=$SG (root/collision) -> node-owned socat proxy"
            [ -S /var/run/docker.sock ] && [ ! -L /var/run/docker.sock ] && rm -f /var/run/docker.sock
            pkill -f 'UNIX-LISTEN:/var/run/docker.sock' 2>/dev/null || true
            setsid sh -c "while true; do socat UNIX-LISTEN:/var/run/docker.sock,fork,mode=660,user=node UNIX-CONNECT:$HOST_SOCK; sleep 2; done" \
                >/var/log/docker-socat.log 2>&1 &
        fi

        # Confirm node can actually reach Docker (diagnostic).
        if timeout 8 gosu node docker info >/dev/null 2>&1; then
            echo "[docker] node has Docker access via host socket"
        else
            echo "[docker] WARNING: 'node' cannot reach Docker via /var/run/docker.sock yet."
        fi

        # SonarQube runs as a host SIBLING; its published 9000 is on the host. Forward
        # 127.0.0.1:9000 -> host.docker.internal:9000 so localhost:9000 keeps working for
        # env-var AND hardcoded-URL skills, and SONAR_HOST_URL stays http://localhost:9000.
        # Self-respawning loop so it heals once the firewall opens and SonarQube is up.
        if ! pgrep -f 'TCP-LISTEN:9000' >/dev/null 2>&1; then
            setsid sh -c 'while true; do socat TCP-LISTEN:9000,fork,reuseaddr,bind=127.0.0.1 TCP:host.docker.internal:9000; sleep 2; done' \
                >/var/log/sonar-forward.log 2>&1 &
            echo "[docker] SonarQube forwarder started (127.0.0.1:9000 -> host.docker.internal:9000)"
        fi
    fi
    ;;

dind)
    # ── Docker-in-Docker ─────────────────────────────────────────────────────
    # Storage driver + log rotation + builder GC come from /etc/docker/daemon.json
    # (NOT from a --storage-driver flag: specifying it in both places makes dockerd
    # refuse to start). overlay2 needs --privileged; if dockerd truly exits, we fall
    # back ONCE to a minimal vfs config, leaving the baked daemon.json pristine.
    if ! command -v dockerd >/dev/null 2>&1; then
        echo "[docker] WARNING: dockerd is not installed in this image; Docker is unavailable."
        exit 0
    fi
    if [ -S /var/run/docker.sock ] && ! timeout 5 docker info >/dev/null 2>&1; then
        echo "[docker] Removing stale Docker socket..."
        rm -f /var/run/docker.sock
    fi

    if [ -S /var/run/docker.sock ]; then
        echo "[docker] Docker socket already present"
        exit 0
    fi

    echo "[docker] Starting Docker daemon (config: /etc/docker/daemon.json)..."

    # Prepare cgroup v2 delegation when the container may (needed for non-privileged DinD).
    # Without --privileged /sys/fs/cgroup is read-only: skip it, dockerd then reports why.
    if [ -f /sys/fs/cgroup/cgroup.procs ] && [ ! -d /sys/fs/cgroup/init ] \
       && mkdir -p /sys/fs/cgroup/init 2>/dev/null; then
        xargs -rn1 < /sys/fs/cgroup/cgroup.procs > /sys/fs/cgroup/init/cgroup.procs 2>/dev/null || true
        sed -e 's/ / +/g' -e 's/^/+/' < /sys/fs/cgroup/cgroup.controllers > /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null || true
    fi

    # nohup (which execs, so $! stays the daemon's PID): the daemon outlives this script, whoever
    # started it (the entrypoint or a postStartCommand).
    nohup dockerd --host=unix:///var/run/docker.sock >/var/log/dockerd.log 2>&1 &
    DOCKERD_PID=$!

    # Readiness poll. If dockerd actually EXITS (bad config / overlay2 unusable),
    # fall back once to a minimal known-good vfs config (in /tmp, not the baked file).
    TRIED_VFS=0
    FAILED=0
    WAIT=30
    until timeout 5 docker info >/dev/null 2>&1; do
        if ! kill -0 "$DOCKERD_PID" 2>/dev/null; then
            if [ "$TRIED_VFS" = "0" ]; then
                echo "[docker] dockerd exited; FALLING BACK TO vfs storage driver"
                echo "[docker] (vfs uses noticeably more disk — check /var/log/dockerd.log)"
                TRIED_VFS=1
                printf '%s\n' '{"storage-driver":"vfs","log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' > /tmp/daemon-vfs.json
                nohup dockerd --host=unix:///var/run/docker.sock --config-file /tmp/daemon-vfs.json >/var/log/dockerd.log 2>&1 &
                DOCKERD_PID=$!
            else
                echo "[docker] dockerd failed to start even with vfs; see /var/log/dockerd.log"
                echo "[docker] (Docker-in-Docker needs --privileged; DOCKER_MODE=none runs without Docker)"
                FAILED=1
                break
            fi
        fi
        WAIT=$((WAIT - 1)); [ "$WAIT" -le 0 ] && break; sleep 1
    done

    if timeout 5 docker info >/dev/null 2>&1; then
        echo "[docker] Docker daemon ready (driver: $(docker info --format '{{.Driver}}' 2>/dev/null))"
        # Our own socket — safe to make it docker-group accessible (node is a member).
        chmod 660 /var/run/docker.sock 2>/dev/null || true
        chgrp docker /var/run/docker.sock 2>/dev/null || true
        # Safe reclaim: dangling images + build cache only. No `container prune` (it would
        # delete a stopped SonarQube container and its state); no `image prune -a` /
        # `system prune --volumes` (they would force costly re-pulls).
        docker image prune -f >/dev/null 2>&1 || true
        docker builder prune -f --keep-storage 10GB >/dev/null 2>&1 || true
    elif [ "$FAILED" = "0" ]; then
        echo "[docker] WARNING: Docker daemon not healthy within 30s."
        echo "[docker] Check /var/log/dockerd.log for details."
    fi
    ;;

*)
    echo "[docker] WARNING: unknown DOCKER_MODE '$DOCKER_MODE' (dind, socket or none); Docker left as it is."
    ;;
esac
exit 0
