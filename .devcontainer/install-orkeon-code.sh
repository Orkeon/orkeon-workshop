#!/usr/bin/env bash
# install-orkeon-code.sh - Orkeon Code and the runtime it needs (D111), at image build.
#
#   install-orkeon-code.sh <orkeon version> <orkeon-code version>
#
# Orkeon Code is a set of scripted commands and crews run by `orkeon-repl`, the scripted-commands
# REPL of Orkeon. The `orkeon` of the image is the dotnet tool, which carries no orkeon-repl, and
# nuget.org publishes none (Orkeon.ConsoleApp is on GitHub Packages alone): the REPL comes from the
# release archive of Orkeon, of which this script keeps what the REPL needs -
#
#   <root>/share/orkeon/release/VERSION, bin/orkeon-repl, libexec/orkeon-repl/, libexec/esbuild-bin/
#   <root>/bin/orkeon-repl  ->  that launcher
#
# (the layout of the archive, which Orkeon Code reads: the VERSION file beside bin/ gives it the
# version, libexec/esbuild-bin the bundler). Orkeon Code itself is installed by its own installer
# from its release archive: <root>/lib/orkeon-code/<version>/, <root>/bin/orkeon-code.
#
# Both archives are checked against the SHA256SUMS of their release. Orkeon Code names the Orkeon
# commit it was written for (.orkeon-version); `orkeon-code --version` prints it beside the Orkeon
# found, and this script prints that line: the two versions are pinned together in image.yml.
#
# Environment: ORKEON_INSTALL_ROOT (default /usr/local), ORKEON_RELEASES and ORKEON_CODE_RELEASES
# (the release download roots, default the GitHub ones).
# Requirements: bash, curl, tar, sha256sum; the network (github.com).
set -euo pipefail

log() { printf '[install-orkeon-code] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

[ $# -eq 2 ] || die "usage: $0 <orkeon version> <orkeon-code version>"
ORKEON_VERSION="$1"; CODE_VERSION="$2"
ROOT="${ORKEON_INSTALL_ROOT:-/usr/local}"
ORKEON_RELEASES="${ORKEON_RELEASES:-https://github.com/Orkeon/orkeon/releases/download}"
CODE_RELEASES="${ORKEON_CODE_RELEASES:-https://github.com/Orkeon/orkeon-code/releases/download}"
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "no Orkeon release archive for $(uname -m)" ;;
esac

WORK="$(mktemp -d "${TMPDIR:-/tmp}/orkeon-code-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

fetch() {   # $1 = URL of the folder of a release, $2 = file name: downloaded and checked against SHA256SUMS
  local dir="$WORK/$(printf '%s' "$1" | sha256sum | cut -c1-12)" expected
  mkdir -p "$dir"
  log "downloading $1/$2"
  curl -fsSL --retry 3 -o "$dir/$2" "$1/$2" || die "cannot download $1/$2"
  [ -f "$dir/SHA256SUMS" ] || curl -fsSL --retry 3 -o "$dir/SHA256SUMS" "$1/SHA256SUMS" || die "cannot download $1/SHA256SUMS"
  expected="$(awk -v n="$2" '$2 == n || $2 == "*" n { print $1; exit }' "$dir/SHA256SUMS")"
  [ -n "$expected" ] || die "$2 is not listed in the SHA256SUMS of its release"
  [ "$(sha256sum "$dir/$2" | cut -d' ' -f1)" = "$expected" ] || die "checksum mismatch for $2"
  FETCHED="$dir/$2"
}

# --- orkeon-repl, from the Orkeon release archive --------------------------------------------
name="orkeon-$ORKEON_VERSION-linux-$ARCH"
fetch "$ORKEON_RELEASES/v$ORKEON_VERSION" "$name.tar.gz"
mkdir -p "$WORK/orkeon"
tar -xzf "$FETCHED" -C "$WORK/orkeon"
src="$WORK/orkeon/$name"
[ -x "$src/bin/orkeon-repl" ] && [ -d "$src/libexec/orkeon-repl" ] || die "$name.tar.gz holds no orkeon-repl"
dest="$ROOT/share/orkeon/release"
rm -rf "$dest"
mkdir -p "$dest/bin" "$dest/libexec" "$ROOT/bin"
# The archive links the files its launchers share: a plain copy of the REPL's folder is whole.
cp -R "$src/libexec/orkeon-repl" "$dest/libexec/orkeon-repl"
[ ! -d "$src/libexec/esbuild-bin" ] || cp -R "$src/libexec/esbuild-bin" "$dest/libexec/esbuild-bin"
cp "$src/bin/orkeon-repl" "$dest/bin/orkeon-repl"
cp "$src/VERSION" "$dest/VERSION"
for f in LICENSE.md THIRD-PARTY-NOTICES.md; do [ ! -f "$src/$f" ] || cp "$src/$f" "$dest/$f"; done
[ ! -d "$src/licenses" ] || cp -R "$src/licenses" "$dest/licenses"
chmod -R a+rX "$dest"
ln -sf "$dest/bin/orkeon-repl" "$ROOT/bin/orkeon-repl"
[ "$(tr -d '[:space:]' < "$dest/VERSION")" = "$ORKEON_VERSION" ] || die "the archive is Orkeon $(cat "$dest/VERSION"), not $ORKEON_VERSION"
rm -rf "$WORK/orkeon"

# --- Orkeon Code, by its own installer ---------------------------------------------------------
fetch "$CODE_RELEASES/v$CODE_VERSION" "orkeon-code-$CODE_VERSION.tar.gz"
mkdir -p "$WORK/code"
tar -xzf "$FETCHED" -C "$WORK/code"
installer="$WORK/code/orkeon-code-$CODE_VERSION/scripts/install.sh"
[ -f "$installer" ] || die "orkeon-code-$CODE_VERSION.tar.gz holds no scripts/install.sh"
bash "$installer" --prefix "$ROOT" --archive "$FETCHED" >&2 || die "the installer of Orkeon Code failed"
[ -x "$ROOT/bin/orkeon-code" ] || die "$ROOT/bin/orkeon-code was not installed"
chmod -R a+rX "$ROOT/lib/orkeon-code"

line="$(cd "$WORK" && HOME="$WORK" PATH="$ROOT/bin:$PATH" "$ROOT/bin/orkeon-code" --version 2>&1 | tr '\n' ' ')"
log "$line"
case "$line" in *"orkeon-code $CODE_VERSION"*) ;; *) die "orkeon-code --version does not say $CODE_VERSION" ;; esac
printf 'orkeon_repl=%s\norkeon_code=%s\n' "$ORKEON_VERSION" "$CODE_VERSION"
