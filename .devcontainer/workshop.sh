# workshop — open Claude Code in the Orkeon workshop.
#
# Sourced by the shells of the image (zsh for `node`, bash; the Dockerfile adds the line to their
# start-up files): it defines the function `workshop` and runs nothing. Plain sh syntax plus
# `local`, which bash and zsh read alike.
#
#   workshop [arguments passed on to claude]
#
# It installs Claude Code first when the container has none (the published image ships without it),
# goes to the workshop ($ORKEON_WORKSHOP, /workspace by default), and starts
#
#   claude --dangerously-skip-permissions --teammate-mode in-process [arguments]
#
# Two variables, one per option — set them for one call (`WORKSHOP_TEAMMATE_MODE=tmux workshop`),
# in the shell, or on the container (`docker run -e …`):
#
#   WORKSHOP_SKIP_PERMISSIONS   on by default: passes --dangerously-skip-permissions, which is what
#                               puts Claude Code in its bypass mode — the `defaultMode` of the
#                               workshop's settings cannot (Claude Code takes that mode from the
#                               command line, never from a project's files). The container is the
#                               sandbox, and the harness's hooks are the guard rails in every mode.
#                               Unset, 1, on, yes or true pass the option; any other value — 0,
#                               off, no, false, an empty one — leaves it out, and Claude Code then
#                               asks for whatever the workshop's settings do not allow.
#   WORKSHOP_TEAMMATE_MODE      in-process by default: passes --teammate-mode in-process, so that the
#                               teammates of an agent team run inside this one terminal. Another value
#                               Claude Code accepts (auto, tmux, iterm2) is passed as it is; empty, 0,
#                               off or none leaves the option out, and Claude Code chooses.
#
# The permission option is left out, with a line saying why, in three cases:
#   - the folder holds no harness (no .claude/.harness-manifest): there are no hooks to guard a
#     session there. WORKSHOP_SKIP_PERMISSIONS set to an on value says you want it all the same;
#   - you are root: Claude Code refuses the option for root, unless IS_SANDBOX=1 says the
#     container is a deliberate sandbox;
#   - you gave an option that decides the matter yourself: --dangerously-skip-permissions,
#     --allow-dangerously-skip-permissions, --permission-mode or --restricted.
# A --teammate-mode of yours replaces the default likewise. Only a real argument counts, not a
# word inside one: a prompt may well quote an option.

workshop() {
  local arg mode=ask perm=ask harness=1
  [ -x /usr/local/bin/init-claude-code.sh ] && /usr/local/bin/init-claude-code.sh
  cd "${ORKEON_WORKSHOP:-/workspace}" || return
  if [ ! -f .claude/.harness-manifest ]; then
    harness=0
    echo "workshop: no harness in $PWD (sync-harness.sh --adopt deploys it)" >&2
  elif [ -z "$(ls -A teams 2>/dev/null)" ]; then
    echo "workshop: new here? Once Claude Code is open, type /orkeon-tour for a guided tour" >&2
  fi

  for arg in "$@"; do
    case "$arg" in
      --teammate-mode|--teammate-mode=*) mode=given ;;
      --dangerously-skip-permissions|--allow-dangerously-skip-permissions|--permission-mode|--permission-mode=*|--restricted) perm=given ;;
    esac
  done
  # The teammate mode first, then the permission option before it: the order of the command above.
  if [ "$mode" = ask ]; then
    case "${WORKSHOP_TEAMMATE_MODE-in-process}" in
      ''|0|off|none) ;;
      *) set -- --teammate-mode "${WORKSHOP_TEAMMATE_MODE-in-process}" "$@" ;;
    esac
  fi
  if [ "$perm" = ask ]; then
    # Asked for in so many words, by default, or declined: any value that is not an on value declines.
    case "${WORKSHOP_SKIP_PERMISSIONS-default}" in
      1|[Oo][Nn]|[Yy][Ee][Ss]|[Tt][Rr][Uu][Ee]) perm=asked ;;
      default) perm=default ;;
      *) perm=declined ;;
    esac
    if [ "$perm" = declined ]; then
      :
    elif [ "$(id -u 2>/dev/null)" = "0" ] && [ "${IS_SANDBOX:-}" != "1" ]; then
      echo "workshop: running as root — --dangerously-skip-permissions is left out (Claude Code refuses it for root, unless IS_SANDBOX=1)" >&2
    elif [ "$harness" = 0 ] && [ "$perm" = default ]; then
      echo "workshop: --dangerously-skip-permissions is left out: no hook guards a session here (WORKSHOP_SKIP_PERMISSIONS=1 passes it all the same)" >&2
    else
      set -- --dangerously-skip-permissions "$@"
    fi
  fi
  claude "$@"
}
