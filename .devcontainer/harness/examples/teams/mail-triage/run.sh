#!/usr/bin/env sh
# Launcher of the Orkeon team 'mail-triage', written by `orkeon-bench scaffold` from mounts.json:
# edit mounts.json, then run `orkeon-bench scaffold mail-triage` again rather than editing this file.
# Orkeon Studio launches the team from its card, without this file, and leaves it as it is.
# Extra arguments are passed through:
#   ./run.sh --validate      ./run.sh -v 2
# TEAM_ENV=<name> runs the team on the mount set mounts.<name>/mail-triage/ of the workshop (one
# folder per mount point) instead of its own folders.
# The team's own Orkeon settings, settings/mail-triage/appsettings.json of the workshop, are passed
# with --settings when the file exists and the command names no other: Orkeon then reads them
# instead of ~/.config/Orkeon/appsettings.json.
SELF="$0"
while [ -L "$SELF" ]; do
  LINK="$(readlink "$SELF")"
  case "$LINK" in
    /*) SELF="$LINK" ;;
    *) SELF="$(dirname "$SELF")/$LINK" ;;
  esac
done
DIR="$(cd "$(dirname "$SELF")" && pwd)" || exit 1
cd "$DIR" || exit 1
quoted() {
  QUOTED= REST="$1"
  while :; do
    case "$REST" in
      *\"*) HEAD=${REST%%\"*}; QUOTED="$QUOTED$HEAD\"\""; REST=${REST#*\"} ;;
      *) QUOTED="$QUOTED$REST"; return ;;
    esac
  done
}
quoted "$DIR"; DIRQ="$QUOTED"
SETTINGS="$(cd "$DIR/../.." && pwd)/settings/$(basename "$DIR")/appsettings.json"
for ARG in "$@"; do case "$ARG" in -s | --settings | --settings=*) SETTINGS= ;; esac; done
if [ -n "$SETTINGS" ] && [ -f "$SETTINGS" ]; then set -- --settings "$SETTINGS" "$@"; fi
need() { [ -d "$1" ] || { echo "run.sh: $1 does not exist (mount point $2)" >&2; exit 2; }; }
if [ -z "${TEAM_ENV:-}" ] || [ "$TEAM_ENV" = default ]; then
  need "$DIR/mailbox" /mailbox
  mkdir -p "$DIR/registry" "$DIR/output" || exit 1
  exec orkeon run "$DIR/crew" "$@" --mount \
    "\"$DIRQ/mailbox\":/mailbox:ro" \
    "\"$DIRQ/registry\":/registry:rw" \
    "\"$DIRQ/output\":/output:rw"
fi
case "$TEAM_ENV" in
  [!a-z]* | *[!a-z0-9-]*) echo "run.sh: TEAM_ENV names a mount set in kebab-case (mounts.<name>/), not '$TEAM_ENV'" >&2; exit 2 ;;
esac
SET="$(cd "$DIR/../.." && pwd)/mounts.$TEAM_ENV/$(basename "$DIR")"
[ -d "$SET" ] || { echo "run.sh: no mount set '$TEAM_ENV' for this team: $SET does not exist" >&2; exit 2; }
quoted "$SET"; SETQ="$QUOTED"
need "$SET/mailbox" /mailbox
mkdir -p "$SET/registry" "$SET/output" || exit 1
exec orkeon run "$DIR/crew" "$@" --mount \
  "\"$SETQ/mailbox\":/mailbox:ro" \
  "\"$SETQ/registry\":/registry:rw" \
  "\"$SETQ/output\":/output:rw" \
  --allow-external-mounts
