#!/usr/bin/env bash
# build-orkeon-studio.sh - Orkeon Studio from its sources at a tag (D111): the package
# Orkeon.Studio.Core into the local NuGet feed, for orkeon-studio-check, and the two terminal
# applications, orkeon-studio-config and orkeon-studio-run.
#
# Usage:
#   build-orkeon-studio.sh <version> <feed-dir> <install-dir> [<src-dir>] [--no-apps]
#
#   <version>      Orkeon Studio version, e.g. 1.3.0 (the git tag is v<version>).
#   <feed-dir>     The local feed build-orkeon-packages.sh fills: Orkeon.Studio.Core.<version>.nupkg
#                  is added to it.
#   <install-dir>  Where the applications go: <install-dir>/orkeon-studio-config/ and
#                  <install-dir>/orkeon-studio-run/, each a framework-dependent publish, with a
#                  launcher of the same name in <install-dir>/bin/.
#   <src-dir>      Optional checkout of Orkeon/orkeon-studio at that version. When omitted the
#                  script clones https://github.com/Orkeon/orkeon-studio.git at tag v<version>
#                  (shallow) into a temporary directory, removed at exit.
#   --no-apps      Pack Orkeon.Studio.Core only.
#
# Since Orkeon 1.0.0-rc.7 Studio lives in its own repository: Orkeon.Studio.Core is no project of
# Orkeon any more, and it is published on no feed. Studio builds against the Orkeon packages of
# nuget.org at the version its Directory.Packages.props pins (OrkeonVersion): the script prints it,
# and the caller checks it against the Orkeon of the image. The restore reads Studio's own
# nuget.config (nuget.org alone).
#
# Environment: ORKEON_STUDIO_REPO_URL (default https://github.com/Orkeon/orkeon-studio.git);
# NUGET_PACKAGES, when set, is the package cache of the restore; unset, the packages go to a
# temporary folder removed at exit (Studio's own default under Linux, <checkout>/packages, is
# overridden, so that nothing is written in <src-dir>: obj/ and bin/ go to a temporary folder too).
# Requirements: bash, git, the .NET SDK of Studio's global.json, the network (nuget.org; github.com
# unless <src-dir> is given).
set -euo pipefail

log() { printf '[build-orkeon-studio] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

APPS=1
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --no-apps) APPS=0 ;;
    -h|--help) sed -n '2,/^[^#]/{/^#/p;}' "$0"; exit 0 ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done
[[ ${#POSITIONAL[@]} -ge 3 && ${#POSITIONAL[@]} -le 4 ]] || die "usage: $0 <version> <feed-dir> <install-dir> [<src-dir>] [--no-apps]"
VERSION="${POSITIONAL[0]}"
FEED="$(mkdir -p "${POSITIONAL[1]}" && cd "${POSITIONAL[1]}" && pwd)"
INSTALL="$(mkdir -p "${POSITIONAL[2]}" && cd "${POSITIONAL[2]}" && pwd)"
SRC="${POSITIONAL[3]:-}"
REPO_URL="${ORKEON_STUDIO_REPO_URL:-https://github.com/Orkeon/orkeon-studio.git}"
command -v dotnet >/dev/null || die "dotnet is required"

WORK=""
cleanup() { [[ -z "$WORK" ]] || rm -rf "$WORK"; }
trap cleanup EXIT
if [[ -z "$SRC" ]]; then
  command -v git >/dev/null || die "git is required"
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/orkeon-studio-src.XXXXXX")"
  SRC="$WORK/orkeon-studio"
  log "cloning $REPO_URL at tag v$VERSION (shallow)"
  git clone --quiet --depth 1 --branch "v$VERSION" --no-tags "$REPO_URL" "$SRC"
fi
SRC="$(cd "$SRC" && pwd)"
[[ -f "$SRC/src/apps/Orkeon.Studio.Core/Orkeon.Studio.Core.csproj" ]] || die "$SRC is no Orkeon Studio checkout"
ORKEON_VERSION="$(sed -n 's|.*<OrkeonVersion>\([^<]*\)</OrkeonVersion>.*|\1|p' "$SRC/Directory.Packages.props" | head -n 1)"
log "Orkeon Studio $VERSION builds against Orkeon ${ORKEON_VERSION:-?} (nuget.org)"

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
BUILD="$(mktemp -d "${TMPDIR:-/tmp}/orkeon-studio-build.XXXXXX")"
trap 'rm -rf "$BUILD"; cleanup' EXIT
COMMON=(-c Release --nologo -v quiet "-p:Version=$VERSION" -p:NuGetAudit=false "-p:StudioBuildRoot=$BUILD/obj"
  "-p:RestorePackagesPath=${NUGET_PACKAGES:-$BUILD/packages}")

log "packing Orkeon.Studio.Core $VERSION into $FEED"
(cd "$SRC" && dotnet pack src/apps/Orkeon.Studio.Core/Orkeon.Studio.Core.csproj "${COMMON[@]}" -p:IsPackable=true -o "$BUILD/pack") \
  || die "dotnet pack of Orkeon.Studio.Core failed"
[[ -f "$BUILD/pack/Orkeon.Studio.Core.$VERSION.nupkg" ]] || die "no Orkeon.Studio.Core.$VERSION.nupkg produced"
rm -f "$FEED"/Orkeon.Studio.Core.*.nupkg
cp "$BUILD/pack/Orkeon.Studio.Core.$VERSION.nupkg" "$FEED/"

if [[ $APPS -eq 1 ]]; then
  mkdir -p "$INSTALL/bin"
  for entry in "orkeon-studio-config|Orkeon.Studio.Config" "orkeon-studio-run|Orkeon.Studio.Run"; do
    name="${entry%%|*}"; project="${entry##*|}"
    log "publishing $name"
    rm -rf "${INSTALL:?}/$name"
    (cd "$SRC" && dotnet publish "src/apps/$project/$project.csproj" "${COMMON[@]}" --use-current-runtime --self-contained false \
       -p:PublishTrimmed=false -p:ErrorOnDuplicatePublishOutputFiles=false -o "$INSTALL/$name") || die "dotnet publish of $name failed"
    [[ -x "$INSTALL/$name/$project" ]] || die "$INSTALL/$name/$project was not produced"
    printf '#!/bin/sh\nexec "%s/%s/%s" "$@"\n' "$INSTALL" "$name" "$project" > "$INSTALL/bin/$name"
    chmod +x "$INSTALL/bin/$name"
  done
fi

printf 'studio_version=%s\norkeon_version=%s\n' "$VERSION" "$ORKEON_VERSION"
