# workshop — open Claude Code in the Orkeon workshop.
#
# Sourced by the shells of the image (zsh for `node`, bash; the Dockerfile adds the line to their
# start-up files): it defines the function `workshop` and runs nothing. Plain sh syntax plus
# `local`, which bash and zsh read alike.
#
#   workshop [--secret NAME]... [arguments passed on to claude]
#
# It installs Claude Code first when the container has none (the published image ships without it),
# goes to the workshop ($ORKEON_WORKSHOP, /workspace by default), and starts
#
#   claude --dangerously-skip-permissions --teammate-mode in-process [arguments]
#
# `--secret NAME` (D47; HARNESS.md rule 10) gives this shell a secret for the session without typing
# it in the clear: the terminal asks for the value of NAME, shows nothing while it is typed, exports it
# and goes on — so that the Orkeon runs Claude Code starts find it, while the value enters neither the
# conversation nor the shell's history (`read -s`). The option is repeatable, comes first, is never
# passed on to claude, and an empty value sets nothing. A name that is not a variable name
# ([A-Za-z_][A-Za-z0-9_]*) stops the command (return 2). The value lives in this shell and dies with
# the container: to keep it, set the variable on your computer and pass `-e NAME` (no value) on
# `docker run`, or `"remoteEnv": {"NAME": "${localEnv:NAME}"}` in the workshop's devcontainer.json.
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
  local arg mode=ask perm=ask harness=1 name value
  # Secrets first (D47): a value read without echo, exported into this shell, never shown nor logged.
  while [ "${1-}" = "--secret" ]; do
    name="${2-}"
    case "$name" in
      ''|[0-9]*|*[!A-Za-z0-9_]*)
        echo "workshop: --secret needs a variable name (letters, digits, _; not starting with a digit), got '${name}'" >&2
        return 2 ;;
    esac
    shift 2
    printf '%s (typed without echo, Enter to finish): ' "$name" >&2
    IFS= read -rs value || value=""
    printf '\n' >&2
    if [ -z "$value" ]; then
      echo "workshop: nothing typed, $name is left as it is" >&2
    else
      export "$name=$value"
      echo "workshop: $name set for this shell (gone with the container; -e $name on docker run keeps it)" >&2
    fi
    value=""
  done
  [ -x /usr/local/bin/init-claude-code.sh ] && /usr/local/bin/init-claude-code.sh
  cd "${ORKEON_WORKSHOP:-/workspace}" || return
  if [ ! -f .claude/.harness-manifest ]; then
    harness=0
    echo "workshop: no harness in $PWD (sync-harness.sh --adopt deploys it)" >&2
  elif [ -z "$(ls -A teams 2>/dev/null)" ]; then
    # The language first: a newcomer who reads little English needs it before the tour (D41). A
    # language is set when .claude/local/language is a regular file whose first line is a tag, as
    # the harness reads it — spaces, a CR and a UTF-8 BOM around it ignored (lib/team-common.sh,
    # harness_workshop_language).
    if [ -f .claude/local/language ] && [ ! -L .claude/local/language ] &&
       head -c 200 .claude/local/language | head -n 1 | LC_ALL=C sed 's/^\xef\xbb\xbf//' | tr -d ' \t\r' |
         grep -Eq '^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?$'; then
      echo "workshop: new here? Once Claude Code is open, type /orkeon-tour for a guided tour" >&2
    else
      echo "workshop: new here? Francais, Deutsch, Espanol...? Once Claude Code is open, type /workshop-language fr (or de, es, pt-BR...) to work in your language, then /orkeon-tour for a guided tour" >&2
    fi
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
