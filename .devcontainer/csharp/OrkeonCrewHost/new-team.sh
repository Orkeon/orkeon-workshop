#!/usr/bin/env bash
# new-team.sh - give a team folder a C# host built from this template.
#
# Usage:
#   new-team.sh <TeamName> <team-dir> [--tool <Tool.csproj>]... [--no-tool]
#
#   <TeamName>  PascalCase identifier of the host: project <TeamName>.Host, its namespace and
#               its tests <TeamName>.Host.Tests (e.g. InvoiceDesk).
#   <team-dir>  The team folder, teams/<slug> of a workshop. It may already hold the team's
#               mounts.json and crew/ (the skill orkeon-crew-csharp writes them first): they are
#               kept. Refused when <team-dir>/host/ exists.
#   --tool      A C# tool project the host compiles in (repeatable), as new-tool.sh makes them:
#               <Tool>.csproj, class <Tool>.Tool.<Tool>Tool. The sample tool is dropped, the
#               project is referenced and added to the solution, and one
#               AddSingleton<IBaseTool, <Tool>Tool>() line goes into TeamTools.cs.
#   --no-tool   A host without a C# tool of its own (built-in tools only): the sample tool is
#               dropped.
#   Neither: the template's sample tool, crew and input are kept, so the folder builds and its
#   tests pass as they are (what verify-templates.sh checks).
#
# The layout it writes (the decision of the skill orkeon-crew-csharp):
#   <team-dir>/host/            <TeamName>.sln, the build files of the template, src/<TeamName>.Host/,
#                               tests/<TeamName>.Host.Tests/ (the host's startup tests), and the
#                               sample tool in src/SampleExtractor/ when kept
#   <team-dir>/run.sh, run.cmd  the launchers: dotnet run of the host, from host/, on the team folder
#   <team-dir>/<mount folders>  each folder of a mount point inside the team, with a .gitkeep
#   <team-dir>/.gitignore       when absent: the run artefacts and the local settings
# No appsettings.json in the team folder (D33): the host reads settings/<slug>/appsettings.json of
# the workshop, two levels above the team folder. Needs python3; --tool needs dotnet (solution).
#
# The folder's name is the team's slug, checked before anything is written: the rule of
# orkeon-bench (lower case, digits and dashes, 1 to 63 characters, no `..`). Everything is built in
# a hidden folder beside the team folder, then moved in: a failure leaves the team folder as it was.
set -euo pipefail

die() { printf 'new-team: %s\n' "$*" >&2; exit 1; }

[[ $# -ge 2 ]] || die "usage: $0 <TeamName> <team-dir> [--tool <Tool.csproj>]... [--no-tool]"
TEAM="$1"; TEAM_DIR="$2"; shift 2
TOOLS=(); MODE=sample
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool) [[ $# -ge 2 ]] || die "--tool needs a project path"
            [[ -f "$2" && "$2" == *.csproj ]] || die "not a project file: $2"
            TOOLS+=("$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"); MODE=tools; shift 2 ;;
    --no-tool) MODE=none; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done
[[ "$MODE" != none || ${#TOOLS[@]} -eq 0 ]] || die "--tool and --no-tool exclude each other"
[[ "$TEAM" =~ ^[A-Z][A-Za-z0-9]+$ ]] || die "<TeamName> must be PascalCase letters/digits (got '$TEAM')"
[[ "$TEAM" != "SampleTeam" ]] || die "choose a name other than the placeholder"
command -v python3 >/dev/null || die "python3 is required"
[[ ${#TOOLS[@]} -eq 0 ]] || command -v dotnet >/dev/null || die "--tool needs dotnet on the PATH"

TEMPLATE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The slug, read from the argument as written, before any folder is made (orkeon-bench's TEAM_SLUG_PATTERN).
TEAM_ARG="${TEAM_DIR%/}"
SLUG="${TEAM_ARG##*/}"
[[ "/$TEAM_ARG/" != */../* ]] || die "the team folder is named without a .. segment (got '$TEAM_DIR')"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || die "the team folder's name must be a team slug: lower case letters, digits and dashes, 1 to 63 characters (got '$SLUG')"
PARENT="$(dirname "$TEAM_ARG")"
[[ -d "$PARENT" ]] || die "$PARENT does not exist: the team folder goes into an existing folder (teams/ of a workshop)"
PARENT="$(cd "$PARENT" && pwd)"
TEAM_DIR="$PARENT/$SLUG"
[[ ! -e "$TEAM_DIR" || -d "$TEAM_DIR" ]] || die "$TEAM_DIR exists and is not a folder"
[[ ! -e "$TEAM_DIR/host" ]] || die "$TEAM_DIR/host exists already: edit it, or remove it to generate it again"
[[ "$MODE" == sample || -f "$TEAM_DIR/mounts.json" ]] || die "$TEAM_DIR/mounts.json is missing: write the team's mount points first"

# Everything is staged in a hidden folder beside the team folder (same depth: the relative paths to
# the tools hold), then moved in at the end; on any failure the stage is removed.
STAGE="$(mktemp -d "$PARENT/.new-team-$SLUG.XXXXXX")"
trap '[[ -z "$STAGE" ]] || rm -rf "$STAGE"' EXIT
W="$STAGE"
HOST="$W/host"

# The host: the build files, src/ and tests/ of the template, without build output.
mkdir "$HOST"
( cd "$TEMPLATE" && tar -cf - \
    --exclude=bin --exclude=obj --exclude=obj-linux --exclude=TestResults --exclude=.vs \
    .editorconfig .gitignore Directory.Build.props Directory.Packages.props global.json nuget.config \
    SampleTeam.sln src tests ) | ( cd "$HOST" && tar -xf - )
[[ -f "$TEMPLATE/../THIRD-PARTY.md" ]] && cp "$TEMPLATE/../THIRD-PARTY.md" "$HOST/"

# What the team folder lacks, from the sample, when the sample tool is kept.
if [[ "$MODE" == sample ]]; then
  [[ -e "$TEAM_DIR/mounts.json" ]] || cp "$TEMPLATE/mounts.json" "$W/"
  [[ -e "$TEAM_DIR/crew" ]] || cp -r "$TEMPLATE/crew" "$W/"
  [[ -e "$TEAM_DIR/input" ]] || cp -r "$TEMPLATE/input" "$W/"
else
  rm -rf "$HOST/src/SampleExtractor"
fi
MOUNTS="$TEAM_DIR/mounts.json"; [[ -f "$MOUNTS" ]] || MOUNTS="$W/mounts.json"

# Rename, then replace the placeholders.
while IFS= read -r -d '' path; do
  base="$(basename "$path")"
  mv "$path" "$(dirname "$path")/${base//SampleTeam/$TEAM}"
done < <(find "$HOST" -depth -name '*SampleTeam*' -print0)
while IFS= read -r -d '' file; do
  if grep -Iq . "$file" 2>/dev/null; then
    sed -i -e "s/SampleTeam/$TEAM/g" -e "s/sample-team/$SLUG/g" "$file"
  fi
done < <(find "$HOST" -type f -print0)
[[ "$MODE" != sample || ! -f "$W/crew/config.yaml" ]] || sed -i "s/\"sample-team\"/\"$SLUG\"/" "$W/crew/config.yaml"

SRC="$HOST/src/$TEAM.Host"
TESTS="$HOST/tests/$TEAM.Host.Tests"

# The project files, the team's tools and the test copy of the team folder, read from mounts.json.
python3 - "$MOUNTS" "$STAGE/.folders" "$SRC" "$TESTS" "$MODE" "${TOOLS[@]}" <<'PY'
import json, os, re, sys
mounts_file, folders_file, src, tests, mode, tools = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6:]
host = os.path.basename(src)

def edit(path, change):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    new = change(text)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(new)

# The host project: the comment says where a workshop's tools are; the references are the tools'.
def host_project(text):
    text = text.replace("../../../library/tools/csharp/", "../../../../../library/tools/csharp/")
    line = '    <ProjectReference Include="..\\SampleExtractor\\SampleExtractor.csproj" />\n'
    if mode != "sample":
        refs = "".join('    <ProjectReference Include="%s" />\n' % os.path.relpath(t, src).replace("/", "\\") for t in tools)
        text = text.replace(line, refs).replace(
            "; the template carries\n         its own copy of the sample tool so that it builds alone.", ".")
    return text
edit(os.path.join(src, host + ".csproj"), host_project)

# TeamTools.cs: one registration per tool, named as new-tool.sh names them.
def team_tools(text):
    if mode == "sample":
        return text
    names = [os.path.splitext(os.path.basename(t))[0] for t in tools]
    text = text.replace("using SampleExtractor.Tool;\n", "".join("using %s.Tool;\n" % n for n in names))
    regs = "".join("        services.AddSingleton<IBaseTool, %sTool>();\n" % n for n in names)
    return text.replace("        services.AddSingleton<IBaseTool, SampleExtractorTool>();\n",
                        regs or "        // No C# tool of the team's own: the built-in suites above only.\n")
edit(os.path.join(src, "Composition", "TeamTools.cs"), team_tools)

# The test copy of the team folder: mounts.json, crew/, and each read-only folder inside the team
# (a read-only mount point must exist; writable ones the host creates).
with open(mounts_file, encoding="utf-8") as f:
    mounts = json.load(f).get("mounts", [])
folders = []
for m in mounts:
    d = str(m.get("default", "")).replace("\\", "/")
    if not d or os.path.isabs(d) or re.match(r"^[A-Za-z]:", d):
        continue
    rel = os.path.normpath(d).replace("\\", "/")
    if rel.startswith("..") or rel == ".":
        continue
    folders.append((rel, m.get("access") == "ro"))
up = "..\\..\\..\\"
content = ['    <Content Include="%smounts.json" Link="team\\mounts.json" CopyToOutputDirectory="PreserveNewest" />' % up,
           '    <Content Include="%screw\\**\\*" Link="team\\crew\\%%(RecursiveDir)%%(Filename)%%(Extension)" CopyToOutputDirectory="PreserveNewest" />' % up]
for rel, ro in folders:
    if ro:
        w = rel.replace("/", "\\")
        content.append('    <Content Include="%s%s\\**\\*" Link="team\\%s\\%%(RecursiveDir)%%(Filename)%%(Extension)" CopyToOutputDirectory="PreserveNewest" />' % (up, w, w))
def test_project(text):
    return re.sub(r'(?m)^    <Content Include="\.\.\\\.\.\\[^\n]*\n(?:    <Content [^\n]*\n)*', lambda _: "\n".join(content) + "\n", text, count=1)
edit(os.path.join(tests, os.path.basename(tests) + ".csproj"), test_project)

# The folders of the mount points inside the team, made once everything else is in place.
with open(folders_file, "w", encoding="utf-8") as f:
    f.write("".join(rel + "\n" for rel, _ in folders))
PY

# The solution: the tools in place of the sample.
if [[ ${#TOOLS[@]} -gt 0 || "$MODE" == none ]]; then
  ( cd "$HOST" && dotnet sln "$TEAM.sln" remove src/SampleExtractor/SampleExtractor.csproj >/dev/null )
  for t in "${TOOLS[@]}"; do ( cd "$HOST" && dotnet sln "$TEAM.sln" add --solution-folder tools "$t" >/dev/null ); done
fi

# The launchers: the host is built and run from host/ (its global.json and nuget.config), on the team folder.
cat > "$W/run.sh" <<EOF
#!/usr/bin/env sh
# Launcher of the C# team '$SLUG', written by new-team.sh: builds and runs its host (host/) on this
# folder. TEAM_ENV=<name> binds the mount set mounts.<name>/$SLUG/ of the workshop; extra arguments
# go to the host (--validate, --input "...", --var KEY=VALUE, --events <file>|-|none).
# The settings are settings/$SLUG/appsettings.json of the workshop, then the ORKEON_ variables.
# POSIX sh, as the YAML and TypeScript launchers: \`sh run.sh\` works as \`./run.sh\` does.
set -eu
SELF="\$0"
while [ -L "\$SELF" ]; do
  LINK="\$(readlink "\$SELF")"
  case "\$LINK" in
    /*) SELF="\$LINK" ;;
    *) SELF="\$(dirname "\$SELF")/\$LINK" ;;
  esac
done
DIR="\$(cd "\$(dirname "\$SELF")" && pwd)"
cd "\$DIR/host"
exec dotnet run --project src/$TEAM.Host -c Release -- --team-dir "\$DIR" "\$@"
EOF
chmod +x "$W/run.sh"
printf '@echo off\r\nrem Launcher of the C# team %s, written by new-team.sh: builds and runs its host on this folder.\r\nrem set TEAM_ENV=NAME binds the mount set mounts.NAME\\%s\\ of the workshop; extra arguments go to the host.\r\nsetlocal\r\nset "DIR=%%~dp0"\r\nset "DIR=%%DIR:~0,-1%%"\r\ncd /d "%%DIR%%\\host"\r\ndotnet run --project src\\%s.Host -c Release -- --team-dir "%%DIR%%" %%*\r\n' \
  "$SLUG" "$SLUG" "$TEAM" > "$W/run.cmd"

[[ -e "$TEAM_DIR/.gitignore" ]] || printf '# Run artefacts and local settings (never commit a key)\n/run/\nllm-logs/\nappsettings.local.json\n' > "$W/.gitignore"

# The mount folders inside the team that do not exist yet, each kept in git by a .gitkeep.
while IFS= read -r rel; do
  [[ -n "$rel" && ! -e "$TEAM_DIR/$rel" ]] || continue
  mkdir -p "$W/$rel"; : > "$W/$rel/.gitkeep"
done < "$STAGE/.folders"
rm -f "$STAGE/.folders"

# Moved in: the whole stage when the team folder is new, else each entry it lacks (host/ in one
# rename) and the launchers, which are the host's.
if [[ ! -e "$TEAM_DIR" ]]; then
  mv "$STAGE" "$TEAM_DIR"
else
  mv "$W/host" "$TEAM_DIR/host"
  mv -f "$W/run.sh" "$W/run.cmd" "$TEAM_DIR/"
  ( cd "$W" && find . -mindepth 1 -maxdepth 1 -print0 ) | while IFS= read -r -d '' entry; do
    entry="${entry#./}"
    if [[ -e "$TEAM_DIR/$entry" ]]; then
      # A mount folder whose parent exists: move the deepest missing part in.
      ( cd "$W/$entry" && find . -mindepth 1 -type d -print0 ) | while IFS= read -r -d '' sub; do
        sub="${sub#./}"; [[ -e "$TEAM_DIR/$entry/$sub" || ! -e "$W/$entry/$sub" ]] || mv "$W/$entry/$sub" "$TEAM_DIR/$entry/$sub"
      done
    else
      mv "$W/$entry" "$TEAM_DIR/$entry"
    fi
  done
  rm -rf "$STAGE"
fi
STAGE=""
HOST="$TEAM_DIR/host"

printf 'Created %s\n' "$HOST"
printf '  host       : %s.Host (tests: %s.Host.Tests), tools: %s\n' "$TEAM" "$TEAM" \
  "$( [[ "$MODE" == sample ]] && echo 'the sample (sample_extractor)' || { [[ "$MODE" == none ]] && echo none || printf '%s ' "${TOOLS[@]##*/}"; } )"
printf '  launchers  : %s/run.sh, run.cmd\n' "$TEAM_DIR"
printf 'Next: cd %q && dotnet build -c Release && dotnet test, then %q --validate\n' "$HOST" "$TEAM_DIR/run.sh"
