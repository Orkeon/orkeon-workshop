#!/usr/bin/env bash
# build-orkeon-packages.sh - build the Orkeon assemblies the harness needs into a LOCAL
# NuGet feed (decision D17: no GitHub Packages token in the image).
#
# Usage:
#   build-orkeon-packages.sh <version> <out-dir> [<src-dir>] [--verify]
#
#   <version>   Orkeon version, e.g. 1.0.0-rc.4 (the git tag is v<version>), or the version
#               of a source build (1.0.0-rc.4.src.20260930.g24ab0d0) with <src-dir>.
#   <out-dir>   Directory that becomes the local feed (flat *.nupkg + MANIFEST.txt).
#   <src-dir>   Optional checkout of Orkeon/orkeon at that version — the image passes the
#               checkout `orkeon-update.sh --source` built the CLI from (D32). When omitted
#               the script clones https://github.com/Orkeon/orkeon.git at tag v<version>
#               (shallow, no submodules) into a temporary work directory.
#   --verify    After packing, restore a throw-away project that references every
#               packed id from <out-dir> + nuget.org, proving the feed is consumable.
#
# Environment:
#   ORKEON_REPO_URL      Clone URL (default https://github.com/Orkeon/orkeon.git).
#   ORKEON_PACK_ROOTS    Space-separated project paths (relative to the checkout) whose
#                        ProjectReference closure is packed. Default:
#                          src/plugins/Orkeon.Plugins src/hosting/Orkeon.Hosting
#                          src/constants/Orkeon.Constants.Protocol
#                          src/analyzers/Orkeon.Compliance.Vfs src/tools/Orkeon.Tools.Rag
#                          src/apps/Orkeon.Studio.Core (the UI-agnostic core of Orkeon Studio,
#                          which orkeon-studio-check runs against the workshop's teams)
#   ORKEON_PACK_WORKDIR  Work directory (default ${TMPDIR:-/tmp}/orkeon-src). The default
#                        one is removed when the script exits; an explicit one is kept (so
#                        is the default with ORKEON_PACK_KEEP=1). A clone already inside is
#                        reused.
#   ORKEON_PACK_FORCE=1  Rebuild even when <out-dir>/MANIFEST.txt already matches.
#   ORKEON_PACK_ATTEMPTS How many times the pack is tried when it fails on the network
#                        (nuget.org or huggingface.co unreachable); default 3. Any other
#                        failure is final at once.
#   NUGET_PACKAGES       When set, restore uses it as the package cache: the third-party
#                        packages Orkeon needs are then already there when the templates
#                        are restored (same closure). When unset, restore goes to the
#                        repository's Linux default (<checkout>/packages, see the root
#                        Directory.Build.props), i.e. inside the work directory, and
#                        disappears with it. Nothing is ever written under $HOME by this
#                        script except NuGet's own http-cache.
#
# Requirements: bash, git, python3 (standard library only), .NET SDK matching the
# repository's global.json (10.0.300, rollForward latestFeature), network access to
# nuget.org, to huggingface.co (the build of Orkeon.Tools.Embeddings.Local downloads its
# ONNX model once) and to github.com unless <src-dir> is given.
#
# What it packs: the WHOLE ProjectReference closure of the roots (27 projects on main at
# 24ab0d0, 26 at v1.0.0-rc.4, whose closure has no Orkeon.Tools.Email; 28 packages with the
# build-time Orkeon.Generators: Orkeon.Domain/Application/Infrastructure, the Constants
# satellites, Tools.Abstractions and every tool family, Analysis, Rag, Scripting, Plugins,
# Hosting, Studio.Core, the VFS analyzer...). Not only the ids that are absent from
# nuget.org (Orkeon.Plugins, Orkeon.Hosting, Orkeon.Studio.Core): a ProjectReference is
# packed as a nuspec dependency on the referenced PROJECT id (Orkeon.Domain,
# Orkeon.Tools.Web...), and those ids exist on no public feed (they live inside the
# `Orkeon` / `Orkeon.Tools` umbrellas). Packing the closure keeps
# every Orkeon assembly a consumer loads built from the same commit; the templates map
# `Orkeon.*` to this feed and everything else to nuget.org (csharp/nuget.config).
#
# Workarounds that `dotnet pack` needs on these projects (all applied below):
#   * -p:IsPackable=true              - the projects are IsPackable=false since PUB-25
#                                       (dotnet pack would silently produce nothing).
#   * -p:Version=<version>            - pins the package version to <version> instead of
#                                       trusting src/Directory.Build.props.
#   * -p:SkipScriptingNpmInstall=true - Orkeon.Scripting otherwise runs `npm ci` to
#                                       fetch esbuild at build time (not needed to pack).
#   * -p:ContinuousIntegrationBuild=true - deterministic paths, as publish.yml does.
#   * a strip target (CustomAfterMicrosoftCommonTargets) - Orkeon.Tools.Embeddings.Local
#                                       would otherwise carry two copies of the 17 MB
#                                       BGE-micro-v2 weights that SmartComponents.LocalEmbeddings
#                                       downloads at build time; the official wrapper project
#                                       removes them with the very same target.
#   * one generated solution          - a single `dotnet pack <sln>` builds the graph
#                                       once, in parallel, instead of one run per project.
#   The package icons (assets/nuget/icon-<family>.png) and READMEs are resolved inside
#   the checkout, so the clone must stay intact until the pack is done. The pinned
#   Roslyn (Microsoft.Net.Compilers.Toolset 5.9.0) is restored by the repository itself.
#   No PublicAPI, SourceLink or shallow-clone issue was met at v1.0.0-rc.4, nor on main
#   at 24ab0d0.
#
# Idempotent: when <out-dir>/MANIFEST.txt records the same version and the same roots, and
# every listed package is present, the script prints the manifest and exits 0 without
# rebuilding.
set -euo pipefail

log() { printf '[build-orkeon-packages] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

VERIFY=0
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --verify) VERIFY=1 ;;
    -h|--help) sed -n '2,/^[^#]/{/^#/p;}' "$0"; exit 0 ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done
[[ ${#POSITIONAL[@]} -ge 2 && ${#POSITIONAL[@]} -le 3 ]] || die "usage: $0 <version> <out-dir> [<src-dir>] [--verify]"

VERSION="${POSITIONAL[0]}"
OUT_DIR="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "${POSITIONAL[1]}")"
SRC_DIR="${POSITIONAL[2]:-}"
REPO_URL="${ORKEON_REPO_URL:-https://github.com/Orkeon/orkeon.git}"
ROOTS="${ORKEON_PACK_ROOTS:-src/plugins/Orkeon.Plugins src/hosting/Orkeon.Hosting src/constants/Orkeon.Constants.Protocol src/analyzers/Orkeon.Compliance.Vfs src/tools/Orkeon.Tools.Rag src/apps/Orkeon.Studio.Core}"
HELPER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/orkeon-pack-helper.py"
[[ -f "$HELPER" ]] || die "helper not found next to this script: $HELPER"
command -v git >/dev/null || die "git is required"
command -v dotnet >/dev/null || die "dotnet is required"
command -v python3 >/dev/null || die "python3 is required"

START=$(date +%s)
mkdir -p "$OUT_DIR"
MANIFEST="$OUT_DIR/MANIFEST.txt"

# ---------------------------------------------------------------- idempotency
if [[ -f "$MANIFEST" && "${ORKEON_PACK_FORCE:-0}" != "1" ]] && grep -qx "version=$VERSION" "$MANIFEST"; then
  if ! grep -qxF "roots=$ROOTS" "$MANIFEST"; then
    log "manifest found for other roots ($(sed -n 's/^roots=//p' "$MANIFEST")) - rebuilding"
  else
    complete=1
    while read -r _id _ver file _rest; do
      [[ -n "$file" && -f "$OUT_DIR/$file" ]] || { complete=0; break; }
    done < <(sed -n '/^packages:/,$p' "$MANIFEST" | tail -n +2)
    if [[ $complete -eq 1 ]]; then
      log "feed already built for $VERSION in $OUT_DIR (ORKEON_PACK_FORCE=1 to rebuild)"
      cat "$MANIFEST"
      exit 0
    fi
    log "manifest found but packages missing - rebuilding"
  fi
fi

# ---------------------------------------------------------------- checkout
WORK="${ORKEON_PACK_WORKDIR:-${TMPDIR:-/tmp}/orkeon-src}"
mkdir -p "$WORK"
cleanup() {
  if [[ "${ORKEON_PACK_KEEP:-0}" == "1" || -n "${ORKEON_PACK_WORKDIR:-}" ]]; then
    log "work directory kept: $WORK"
  else
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

if [[ -n "$SRC_DIR" ]]; then
  SRC_DIR="$(cd "$SRC_DIR" && pwd)"
  SOURCE_LABEL="$(git -C "$SRC_DIR" remote get-url origin 2>/dev/null || echo "$SRC_DIR")@$(git -C "$SRC_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  log "using source checkout $SRC_DIR"
else
  SRC_DIR="$WORK/orkeon"
  SOURCE_LABEL="$REPO_URL@v$VERSION"
  if [[ -d "$SRC_DIR/.git" ]]; then
    log "reusing clone in $SRC_DIR"
  else
    log "cloning $REPO_URL at tag v$VERSION (shallow)"
    git clone --quiet --depth 1 --branch "v$VERSION" --no-tags "$REPO_URL" "$SRC_DIR"
  fi
fi
COMMIT="$(git -C "$SRC_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
log "source commit $COMMIT"

# ---------------------------------------------------------------- plan
PLAN="$WORK/plan.json"
# shellcheck disable=SC2086
python3 "$HELPER" plan "$SRC_DIR" $ROOTS > "$PLAN"
mapfile -t PROJECTS < <(python3 -c 'import json,sys; [print(e["path"]) for e in json.load(open(sys.argv[1]))["projects"]]' "$PLAN")
[[ ${#PROJECTS[@]} -gt 0 ]] || die "empty closure"
log "${#PROJECTS[@]} projects in the closure of: $ROOTS"
for p in "${PROJECTS[@]}"; do log "  - $(basename "$p" .csproj)"; done

# ---------------------------------------------------------------- pack
STAGE="$WORK/stage"
SLN_DIR="$WORK/sln"
rm -rf "$STAGE" "$SLN_DIR"; mkdir -p "$STAGE" "$SLN_DIR"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
dotnet new sln -n orkeon-local-feed -o "$SLN_DIR" > /dev/null
SLN="$(ls "$SLN_DIR"/orkeon-local-feed.sln* | head -n 1)"
dotnet sln "$SLN" add "${PROJECTS[@]}" > /dev/null

# Same target as the official wrapper (src/packaging/Orkeon.Tools.Embeddings.Local):
# SmartComponents' downloaded model weights flow into the Content of the project that
# references it, and pack would copy them into the library package. Strip them.
STRIP_TARGETS="$WORK/orkeon-harness-pack.targets"
cat > "$STRIP_TARGETS" <<'EOF_TARGETS'
<Project>
  <Target Name="OrkeonHarnessStripUpstreamContentFromPackage" BeforeTargets="GenerateNuspec">
    <ItemGroup>
      <_PackageFiles Remove="@(_PackageFiles)"
                     Condition="$([System.String]::Copy('%(_PackageFiles.Identity)').Contains('smartcomponents'))" />
    </ItemGroup>
  </Target>
</Project>
EOF_TARGETS

PACK_ARGS=(-c Release -o "$STAGE" --nologo
  -p:IsPackable=true
  "-p:Version=$VERSION"
  -p:ContinuousIntegrationBuild=true
  -p:SkipScriptingNpmInstall=true
  "-p:CustomAfterMicrosoftCommonTargets=$STRIP_TARGETS")
if [[ -n "${NUGET_PACKAGES:-}" ]]; then
  mkdir -p "$NUGET_PACKAGES"
  PACK_ARGS+=("-p:RestorePackagesPath=$NUGET_PACKAGES")
fi

t0=$(date +%s)
log "dotnet pack $(basename "$SLN") (one build of the whole graph; log: $WORK/pack.log)"
# The pack downloads from nuget.org and huggingface.co. A network failure is retried (the
# retry is incremental: what was restored and compiled is kept); any other failure is final.
NETWORK_ERRORS='MSB3923|NU1301|Name or service not known|Temporary failure in name resolution|Resource temporarily unavailable|timed out|Connection reset|Connection refused|SSL connection could not be established'
PACK_ATTEMPTS="${ORKEON_PACK_ATTEMPTS:-3}"
attempt=1
until dotnet pack "$SLN" "${PACK_ARGS[@]}" > "$WORK/pack.log" 2>&1; do
  if [[ $attempt -lt $PACK_ATTEMPTS ]] && grep -q -E "$NETWORK_ERRORS" "$WORK/pack.log"; then
    attempt=$((attempt + 1))
    log "network failure during the pack ($(grep -m1 -o -E "$NETWORK_ERRORS" "$WORK/pack.log")), retrying in 30 s (attempt $attempt/$PACK_ATTEMPTS)"
    sleep 30
    continue
  fi
  grep -E "error|warning NU" "$WORK/pack.log" | sort -u | head -n 40 >&2
  die "dotnet pack failed (full log: $WORK/pack.log)"
done
PACK_SECONDS=$(( $(date +%s) - t0 ))
log "packed in ${PACK_SECONDS}s"

# ---------------------------------------------------------------- install + manifest
rm -f "$OUT_DIR"/*.nupkg "$OUT_DIR"/*.snupkg
{
  echo "# Orkeon local NuGet feed - built by build-orkeon-packages.sh"
  echo "version=$VERSION"
  echo "commit=$COMMIT"
  echo "source=$SOURCE_LABEL"
  echo "built_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "roots=$ROOTS"
  echo "pack_seconds=$PACK_SECONDS"
  echo "packages:"
} > "$MANIFEST.tmp"

shopt -s nullglob
count=0
for nupkg in "$STAGE"/*.nupkg; do
  file="$(basename "$nupkg")"
  id="${file%.$VERSION.nupkg}"
  cp "$nupkg" "$OUT_DIR/$file"
  deps="$(python3 "$HELPER" deps "$nupkg" | paste -sd ';' -)"
  sha="$(sha256sum "$OUT_DIR/$file" | cut -d' ' -f1)"
  size="$(stat -c %s "$OUT_DIR/$file")"
  echo "$id $VERSION $file sha256=$sha bytes=$size deps=${deps:--}" >> "$MANIFEST.tmp"
  count=$((count + 1))
done
for snupkg in "$STAGE"/*.snupkg; do
  cp "$snupkg" "$OUT_DIR/"
done
mv "$MANIFEST.tmp" "$MANIFEST"
# Every closure project must have produced its package. Extra packages are expected: the
# build-time projects referenced as analyzers (Orkeon.Generators) are packed alongside.
missing=0
for p in "${PROJECTS[@]}"; do
  id="$(python3 -c 'import json,sys; print(next(e["packageId"] for e in json.load(open(sys.argv[1]))["projects"] if e["path"] == sys.argv[2]))' "$PLAN" "$p")"
  [[ -f "$OUT_DIR/$id.$VERSION.nupkg" ]] || { log "ERROR: no package produced for $id"; missing=1; }
done
[[ $missing -eq 0 ]] || die "incomplete feed - see $WORK/pack.log"
log "$count packages for ${#PROJECTS[@]} closure projects"

# ---------------------------------------------------------------- verify (optional)
if [[ $VERIFY -eq 1 ]]; then
  VER_DIR="$WORK/verify"
  rm -rf "$VER_DIR"; mkdir -p "$VER_DIR"
  {
    echo '<Project Sdk="Microsoft.NET.Sdk">'
    echo '  <PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType></PropertyGroup>'
    echo '  <ItemGroup>'
    while read -r id ver _rest; do
      [[ -n "$id" ]] && echo "    <PackageReference Include=\"$id\" Version=\"$ver\" />"
    done < <(sed -n '/^packages:/,$p' "$MANIFEST" | tail -n +2)
    echo '  </ItemGroup>'
    echo '</Project>'
  } > "$VER_DIR/verify.csproj"
  cat > "$VER_DIR/nuget.config" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="orkeon-local" value="$OUT_DIR" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="orkeon-local"><package pattern="Orkeon.*" /></packageSource>
    <packageSource key="nuget.org"><package pattern="*" /></packageSource>
  </packageSourceMapping>
</configuration>
EOF
  echo 'return 0;' > "$VER_DIR/Program.cs"
  log "verifying the feed: restoring a project that references every packed id"
  if ! dotnet restore "$VER_DIR/verify.csproj" --nologo --packages "${NUGET_PACKAGES:-$SRC_DIR/packages}" > "$WORK/verify.log" 2>&1; then
    grep -E "error" "$WORK/verify.log" | sort -u | head -n 20 >&2
    die "feed verification failed (log: $WORK/verify.log)"
  fi
  log "feed verification OK"
fi

# ---------------------------------------------------------------- report
log "done in $(( $(date +%s) - START ))s - $count packages, feed $OUT_DIR ($(du -sh "$OUT_DIR" | cut -f1)), work dir $(du -sh "$WORK" 2>/dev/null | cut -f1)"
cat "$MANIFEST"
