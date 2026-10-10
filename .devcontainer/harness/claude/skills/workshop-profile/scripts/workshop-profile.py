#!/usr/bin/env python3
"""/workshop-profile - the profile of a space: which packs of the harness it deploys.

docs/profiles-design.md §§ 2-7, D48-D55; the definitions and their schema are `profiles/`
(`profiles/README.md`). A space is the folder Claude Code works in: a workshop, or the git
checkout of a repository (a source space). A profile is a list of packs; the packs that fit the
space are deployed by `sync-harness.sh`, which calls `--resolve` below. Switching is this script,
not the model: it writes `.claude/local/profile`, the keys it owns in `.claude/settings.local.json`
(`env` switches of the packs, `skillOverrides` of the harness skills), records them in
`.claude/local/profile.owned.json` so that the next switch undoes exactly them, then runs the
synchronisation.

Usage:
    workshop-profile.py                      the active profile (as --show)
    workshop-profile.py <profile>            switch: user, contrib, dev, release, docs, all, or a
                                             profile of .claude/local/profiles/<name>.yaml
    workshop-profile.py custom:<pack>,<pack> switch to packs chosen by hand (core always added)
    workshop-profile.py --list               the profiles and packs, and what fits here
    workshop-profile.py --show               the active profile, its effective packs and switches
    workshop-profile.py <profile> --dry-run  what a switch would write; writes nothing
    workshop-profile.py <profile> --no-sync  switch without running sync-harness.sh
    workshop-profile.py --check              the definitions and the partition of the files (evals)
    workshop-profile.py --resolve [--space <space>] [--manifest <in> <out>]
        For sync-harness.sh and the SessionStart hook: machine lines `<key> <value>`, one per line:
          space    workshop | source | unknown
          profile  the active profile (`user` when none is set)
          packs    the effective packs, space-separated, core first
          skills   the skills deployed without their pack, space-separated (may be empty)
          note     a profile that does not apply here, replaced by `user` in a workshop (optional)
          refused  why nothing applies here (exit 2)
        --manifest copies to <out> the lines of the image manifest <in> ("<sha256>  <path>") whose
        file is deployed in this space. --space forces the space (`sync-harness.sh --adopt`).

Exit 0 done; 2 refused (usage, an unknown or unfitting profile, an unknown space, a tracked
target, an unreadable settings file) - nothing is written; 1 the definitions are broken, PyYAML
is missing, or the synchronisation failed. Every line printed starts with `workshop-profile:`
(a frozen literal, FROZEN-LITERALS.md), except the machine lines of --resolve.

The space (same tests as `sync-harness.sh`): `.claude/.harness-space` when it names one; else a
workshop (`is_workshop`: a harness manifest or marker in .claude/, a teams/ folder, or nothing
visible in the folder); else a source space when the folder is the top of a git work tree; else
unknown. The root is $ORKEON_WORKSHOP, else $CLAUDE_PROJECT_DIR, else ~/Orkeon
(lib/team-common.sh, harness_workshop_root). The definitions are read from $HARNESS_STAGING
(default /usr/local/share/claude-harness, the image's staging), else from the harness this
script ships in; hand-made profiles from <root>/.claude/local/profiles/*.yaml.
"""
import json
import os
import re
import subprocess
import sys

PREFIX = "workshop-profile:"
NAME_RE = re.compile(r"^[a-z][a-z0-9-]*$")
# One line of .claude/local/profile; the same shape as HARNESS_PROFILE_NAME in lib/team-common.sh.
PROFILE_RE = re.compile(r"^(custom:[a-z][a-z0-9-]*(,[a-z][a-z0-9-]*)*|[a-z][a-z0-9-]*)$")
SPACES = ("workshop", "source")
VISIBILITY = ("on", "name-only", "user-invocable-only", "off")
LITTER = {"desktop.ini", "Thumbs.db", "lost+found"}
DEFAULT_STAGING = "/usr/local/share/claude-harness"
PROFILE_FILE = ".claude/local/profile"
OWNED_FILE = ".claude/local/profile.owned.json"
SETTINGS_FILE = ".claude/settings.local.json"
SPACE_FILE = ".claude/.harness-space"
MANIFEST_FILE = ".claude/.harness-manifest"
# What the switcher and the synchronisation write in a space besides the deployed files.
STATE_FILES = (PROFILE_FILE, OWNED_FILE, SETTINGS_FILE, SPACE_FILE,
               MANIFEST_FILE, ".claude/.harness-initialized")
# sync-harness.sh, target_of: the seeds, created once in a workshop and never in a source space.
SEEDS = {
    "claude/CLAUDE.workshop.md": "CLAUDE.md",
    "claude/gitignore.workshop": ".gitignore",
    "claude/gitattributes.workshop": ".gitattributes",
    "claude/settings.local.seed.json": ".claude/settings.local.json",
    "claude/devcontainer.workshop.json": ".devcontainer/devcontainer.json",
    "claude/settings-readme.workshop.md": "settings/README.md",
}
SKILL_RE = re.compile(r"^(?:packs/[^/]+/)?claude/skills/([^/]+)/")
HERE = os.path.dirname(os.path.realpath(__file__))   # also when run through a link on the PATH


class Refusal(Exception):
    """Nothing applies or nothing may be written: exit 2."""


class Broken(Exception):
    """The definitions, the tools or the synchronisation failed: exit 1."""


def say(*lines):
    for line in lines:
        print("%s %s" % (PREFIX, line))


try:
    import yaml
except ImportError:
    say("PyYAML is needed to read the profiles (pip install pyyaml).")
    sys.exit(1)


# ── Where things are ─────────────────────────────────────────────────────────────────────────

def workshop_root():
    for var in ("ORKEON_WORKSHOP", "CLAUDE_PROJECT_DIR"):
        value = os.environ.get(var)
        if value:
            return os.path.normpath(value)
    return os.path.join(os.environ.get("HOME") or "/home/node", "Orkeon")


def harness_dir():
    """(folder holding profiles/, whether it is a complete harness tree)."""
    staging = os.environ.get("HARNESS_STAGING")
    candidates = [staging] if staging else [DEFAULT_STAGING, os.path.normpath(os.path.join(HERE, "../../../.."))]
    for folder in candidates:
        if os.path.isdir(os.path.join(folder, "profiles", "packs")):
            return folder, True
    # Deployed in a space: the definitions are in .claude/harness/profiles/, the tree is not.
    deployed = os.path.normpath(os.path.join(HERE, "../../../harness"))
    if not staging and os.path.isdir(os.path.join(deployed, "profiles", "packs")):
        return deployed, False
    raise Broken("no profile definitions in %s." % " or ".join(candidates))


def walk_files(folder):
    """Every file of the harness tree, as the image manifest lists them (a .env never)."""
    out = []
    for top, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if d not in (".fixtures", "node_modules", "__pycache__"))
        for name in files:
            if name == ".env":
                continue
            out.append(os.path.relpath(os.path.join(top, name), folder).replace(os.sep, "/"))
    return sorted(out)


def read_manifest(path):
    lines = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.rstrip("\r\n")
            if line and "  " in line:
                lines.append((line.split("  ", 1)[1], line))
    return lines


# ── Definitions ──────────────────────────────────────────────────────────────────────────────

def glob_re(glob):
    out, i = "", 0
    while i < len(glob):
        if glob.startswith("**", i):
            out += ".*"
            i += 2
            continue
        char = glob[i]
        out += "[^/]*" if char == "*" else "[^/]" if char == "?" else re.escape(char)
        i += 1
    return re.compile("^" + out + "$")


def load_yaml(path):
    try:
        with open(path, encoding="utf-8") as handle:
            data = yaml.safe_load(handle)
    except (OSError, yaml.YAMLError) as exc:
        raise Broken("%s cannot be read: %s" % (path, str(exc).splitlines()[0]))
    if not isinstance(data, dict):
        raise Broken("%s is not a mapping." % path)
    return data


def visibility(path, skills, fail):
    """A skills mapping; YAML 1.1 reads a bare on / off as a boolean, taken back to its word."""
    if not isinstance(skills, dict):
        raise fail("%s: skills is a mapping of skill: visibility." % path)
    out = {}
    for skill, value in skills.items():
        value = {True: "on", False: "off"}.get(value, value) if isinstance(value, bool) else value
        if value not in VISIBILITY or not isinstance(skill, str):
            raise fail("%s: a skill's visibility is one of %s." % (path, ", ".join(VISIBILITY)))
        out[skill] = value
    return out


def str_list(value):
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


class Defs:
    """The packs and profiles of profiles/, and the files of the harness tree they share out."""

    def __init__(self, folder, complete):
        self.folder, self.complete = folder, complete
        self.packs, self.profiles, self.matchers = {}, {}, []
        self.remainder = None
        pdir = os.path.join(folder, "profiles")
        for name in sorted(os.listdir(os.path.join(pdir, "packs"))):
            if name.endswith(".yaml"):
                self._pack(os.path.join(pdir, "packs", name))
        if self.remainder is None:
            raise Broken("no pack takes the remainder (files: remainder).")
        for name in sorted(os.listdir(pdir)):
            if name.endswith(".yaml"):
                self.profiles[name[:-5]] = self._profile(os.path.join(pdir, name), "shipped")
        self.files = walk_files(folder) if complete else None
        self.skills = {}            # skill -> pack
        if self.files is not None:
            for rel in self.files:
                m = SKILL_RE.match(rel)
                if m:
                    self.skills.setdefault(m.group(1), self.pack_of(rel))

    def _pack(self, path):
        data = load_yaml(path)
        name = os.path.basename(path)[:-5]
        if data.get("name") != name or not NAME_RE.match(name):
            raise Broken("%s: name must be the file name." % path)
        spaces = data.get("spaces")
        if not str_list(spaces) or not spaces or set(spaces) - set(SPACES):
            raise Broken("%s: spaces must list workshop and/or source." % path)
        switches = data.get("switches") or {}
        if not isinstance(switches, dict) or any(not re.match(r"^HARNESS_[A-Z0-9_]+$", k) or not isinstance(v, str)
                                                 for k, v in switches.items()):
            raise Broken("%s: switches are HARNESS_* names with string values." % path)
        skills = visibility(path, data.get("skills") or {}, Broken)
        repos, with_ = data.get("repos") or [], data.get("with") or []
        if not str_list(repos) or not str_list(with_):
            raise Broken("%s: repos and with are lists." % path)
        files = data.get("files", "packs/%s/" % name)
        if files == "remainder":
            if self.remainder:
                raise Broken("two packs take the remainder: %s and %s." % (self.remainder, name))
            self.remainder = name
        elif isinstance(files, str) and files.endswith("/"):
            self.matchers.append((name, re.compile("^" + re.escape(files))))
        elif str_list(files):
            self.matchers += [(name, glob_re(g)) for g in files]
        else:
            raise Broken("%s: files is a folder (trailing /), a list of globs, or remainder." % path)
        self.packs[name] = {"spaces": spaces, "switches": switches, "skills": skills,
                            "repos": [re.compile(r) for r in repos], "with": with_}

    def _profile(self, path, origin):
        fail = Broken if origin == "shipped" else Refusal
        try:
            data = load_yaml(path)
        except Broken as exc:
            raise fail(str(exc))
        name = os.path.basename(path)[:-5]
        if data.get("name") != name or not NAME_RE.match(name) or name == "custom":
            raise fail("%s: name must be the file name (and not custom)." % path)
        packs = data.get("packs")
        if not str_list(packs) or not packs:
            raise fail("%s: packs must list packs." % path)
        unknown = [p for p in packs if p not in self.packs]
        if unknown:
            raise fail("%s names unknown pack(s): %s." % (path, ", ".join(unknown)))
        skills = visibility(path, data.get("skills") or {}, fail)
        return {"name": name, "packs": packs, "skills": skills, "origin": origin,
                "description": str(data.get("description") or "")}

    def pack_of(self, rel):
        owners = [name for name, rx in self.matchers if rx.match(rel)]
        if len(owners) > 1:
            raise Broken("%s belongs to %s." % (rel, " and ".join(owners)))
        if owners:
            return owners[0]
        return None if rel.startswith("packs/") else self.remainder

    def profile(self, spec, root):
        """The profile named by spec: custom:<packs>, a shipped one, or a hand-made one."""
        if spec.startswith("custom:"):
            packs = spec[len("custom:"):].split(",")
            unknown = [p for p in packs if p not in self.packs]
            if unknown:
                raise Refusal("unknown pack(s) %s - the packs are: %s." % (", ".join(unknown), ", ".join(sorted(self.packs))))
            return {"name": spec, "packs": packs, "skills": {}, "origin": "custom", "description": "packs chosen by hand"}
        if spec in self.profiles:
            return self.profiles[spec]
        mine = os.path.join(root, ".claude", "local", "profiles", spec + ".yaml")
        if spec != "custom" and os.path.isfile(mine):
            return self._profile(mine, "local")
        hint = " (custom takes packs: custom:<pack>,<pack>)" if spec == "custom" else ""
        raise Refusal("no profile %s%s - the profiles are: %s, custom:<packs>." % (spec, hint, ", ".join(self.profile_names(root))))

    def profile_names(self, root):
        names = list(self.profiles)
        mine = os.path.join(root, ".claude", "local", "profiles")
        if os.path.isdir(mine):
            names += sorted(n[:-5] for n in os.listdir(mine)
                            if n.endswith(".yaml") and n[:-5] not in self.profiles and NAME_RE.match(n[:-5]))
        order = ["user", "contrib", "dev", "release", "docs", "all"]
        return sorted(names, key=lambda n: (order.index(n) if n in order else len(order), n))


# ── The space ────────────────────────────────────────────────────────────────────────────────

def git(root, *args):
    try:
        run = subprocess.run(["git", "-C", root] + list(args), capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return 1, "", "git is not available"
    return run.returncode, run.stdout, run.stderr


def recorded_space(root):
    path = os.path.join(root, SPACE_FILE)
    if os.path.islink(path) or not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            value = handle.read(200).strip().lstrip("﻿").strip()
    except OSError:
        return None
    return value if value in SPACES else None


def is_workshop(root):
    state = os.path.join(root, ".claude")
    if any(os.path.isfile(os.path.join(state, f)) for f in (".harness-manifest", ".harness-initialized")):
        return True
    if os.path.isdir(os.path.join(root, "teams")):
        return True
    return not any(e for e in os.listdir(root) if not e.startswith(".") and e not in LITTER)


def detect_space(root):
    """(space, why) - why says what made an unknown space unknown."""
    if not os.path.isdir(root):
        return "unknown", "%s is not a folder" % root
    recorded = recorded_space(root)
    if recorded:
        return recorded, ""
    if is_workshop(root):
        return "workshop", ""
    rc, out, err = git(root, "rev-parse", "--show-toplevel")
    if rc == 0 and os.path.realpath(out.strip()) == os.path.realpath(root):
        return "source", ""
    if "dubious ownership" in err:
        return "unknown", "git refuses %s (dubious ownership: git config --global --add safe.directory %s)" % (root, root)
    if rc == 0:
        return "unknown", "%s is inside a git work tree but not at its top (%s)" % (root, out.strip())
    return "unknown", "%s is neither a workshop (no teams/, no harness deployed, not empty) nor the top of a git work tree" % root


def origin_of(root):
    rc, out, _ = git(root, "remote", "get-url", "origin")
    return out.strip() if rc == 0 else ""


def read_profile_file(root):
    """(spec, state): state ok | absent | invalid - the reading of harness_workshop_profile."""
    path = os.path.join(root, PROFILE_FILE)
    if not os.path.lexists(path):
        return None, "absent"
    if os.path.islink(path) or not os.path.isfile(path):
        return None, "invalid"
    try:
        with open(path, "rb") as handle:
            raw = handle.read(200)
    except OSError:
        return None, "invalid"
    line = raw.split(b"\n", 1)[0]
    if line.startswith(b"\xef\xbb\xbf"):
        line = line[3:]
    line = re.sub(rb"[ \t\r]", b"", line).decode("ascii", "replace")
    if not line:
        return None, "absent"
    return (line, "ok") if PROFILE_RE.match(line) else (None, "invalid")


def active_profile(root):
    """(spec, where): the profile file, else HARNESS_PROFILE, else user."""
    spec, state = read_profile_file(root)
    if state == "ok":
        return spec, PROFILE_FILE
    if state == "invalid":
        return "user", "default (%s is not a profile name: ignored)" % PROFILE_FILE
    env = (os.environ.get("HARNESS_PROFILE") or "").strip()
    if env and PROFILE_RE.match(env):
        return env, "HARNESS_PROFILE"
    if env:
        return "user", "default (HARNESS_PROFILE is not a profile name: ignored)"
    return "user", "default"


# ── Resolution ───────────────────────────────────────────────────────────────────────────────

def is_guard(key):
    return key.startswith("HARNESS_GUARD_") or key == "HARNESS_SECRET_GUARD"


def merge_switches(defs, packs):
    out = {}
    for pack in packs:
        for key, value in defs.packs[pack]["switches"].items():
            if key not in out or out[key] == value:
                out[key] = value
            elif is_guard(key):
                out[key] = "1"
            elif key.endswith(("_LINES", "_BYTES")) and out[key].isdigit() and value.isdigit():
                out[key] = str(min(int(out[key]), int(value)))
            else:
                raise Broken("%s is set to %s and %s by the packs %s." % (key, out[key], value, ", ".join(packs)))
    return out


def fits(defs, pack, space, origin):
    d = defs.packs[pack]
    if space not in d["spaces"]:
        return "%s only" % " and ".join(d["spaces"])
    if d["repos"] and not any(rx.search(origin) for rx in d["repos"]):
        return "for another repository (origin %s)" % (origin or "not set")
    return ""


def resolve(defs, prof, space, origin):
    """The effective packs of a profile in a space, or a Refusal."""
    listed = ["core"] + [p for p in prof["packs"] if p != "core"]
    listed = [p for i, p in enumerate(listed) if p not in listed[:i]]
    packs, left = [], []
    for pack in listed:
        why = fits(defs, pack, space, origin)
        (left.append((pack, why)) if why else packs.append(pack))
    for pack in sorted(defs.packs):
        d = defs.packs[pack]
        if d["repos"] and pack not in listed and not fits(defs, pack, space, origin) and set(d["with"]) & set(packs):
            packs.append(pack)
    if not profile_fits(defs, prof, space, origin):
        here = [n for n in defs.profile_names("/nonexistent") if n != prof["name"]
                and profile_fits(defs, defs.profiles[n], space, origin)]
        raise Refusal("%s in a %s space: %s - fits here: %s." % (
            prof["name"], space, "; ".join("%s is %s" % (p, w) for p, w in left if p != "core") or "nothing beyond core",
            ", ".join(here + ["custom"])))
    extra = {s: v for s, v in prof["skills"].items() if v != "off" and defs.skills.get(s) not in packs}
    if defs.files is not None:
        unknown = [s for s in prof["skills"] if s not in defs.skills]
        if unknown:
            raise Refusal("%s names skill(s) the harness does not ship: %s." % (prof["name"], ", ".join(unknown)))
    return {"profile": prof, "space": space, "packs": packs, "left": left, "extra": extra,
            "switches": merge_switches(defs, packs)}


def profile_fits(defs, prof, space, origin):
    """A profile fits a space when one of its packs made for one space only fits it (dev has
    usage, which fits a workshop too, and is not a workshop profile for that); a profile made of
    packs that fit both spaces only (custom:contrib,usage) fits when one of them does."""
    packs = [p for p in prof["packs"] if p != "core"]
    single = [p for p in packs if len(defs.packs[p]["spaces"]) == 1]
    return any(not fits(defs, p, space, origin) for p in (single or packs))


def deployed_files(defs, res, files):
    """The files (paths of the harness tree) the resolution deploys."""
    extra = tuple(res["extra"])
    out = []
    for rel in files:
        pack = defs.pack_of(rel)
        m = SKILL_RE.match(rel)
        if pack in res["packs"] or (m and m.group(1) in extra):
            if res["space"] == "source" and rel in SEEDS:
                continue
            out.append(rel)
    return out


def target_of(rel):
    """Where a file of the harness tree lands in a space (sync-harness.sh, target_of)."""
    if rel in SEEDS:
        return SEEDS[rel]
    m = re.match(r"^packs/([^/]+)/(.*)$", rel)
    if m:
        rest = m.group(2)
        return ".claude/" + rest[len("claude/"):] if rest.startswith("claude/") else ".claude/harness/packs/%s/%s" % (m.group(1), rest)
    for src, dst in (("claude/", ".claude/"), ("references/", "references/"), ("examples/", "library/examples/"),
                     ("evals/", ".claude/evals/"), ("library/", "library/")):
        if rel.startswith(src):
            return dst + rel[len(src):]
    return ".claude/harness/" + rel


def removed_targets(root, files):
    """The targets the synchronisation removes: deployed last time (the space's manifest), not now."""
    path = os.path.join(root, MANIFEST_FILE)
    try:
        lines = read_manifest(path) if os.path.isfile(path) and not os.path.islink(path) else []
    except (OSError, ValueError):
        lines = []
    keep = set(files)
    return {target_of(rel) for rel, _ in lines if rel not in keep and rel not in SEEDS}


def stays(root, skill, removed):
    """Whether a skill's folder is still on disk once the synchronisation has removed `removed`: it
    goes when it holds files and every one of them is removed (its folders are pruned once empty)."""
    folder = os.path.join(root, ".claude", "skills", skill)
    if not os.path.isdir(folder):
        return False
    files = [os.path.relpath(os.path.join(top, n), root).replace(os.sep, "/")
             for top, _, names in os.walk(folder) for n in names]
    return not files or not all(f in removed for f in files)


def overrides(defs, res, root, removed):
    """skillOverrides: off for a harness skill on disk that the profile leaves out and the
    synchronisation leaves there (a key for a folder it removes would outlive it), then the packs'
    visibility, then the profile's."""
    wanted = {}
    keep = set(res["extra"]) | {s for s, p in defs.skills.items() if p in res["packs"]}
    for skill in sorted(defs.skills):
        if skill not in keep and stays(root, skill, removed):
            wanted[skill] = "off"
    for pack in res["packs"]:
        wanted.update({s: v for s, v in defs.packs[pack]["skills"].items() if s in keep})
    wanted.update(res["profile"]["skills"])
    return wanted


# ── Writing ──────────────────────────────────────────────────────────────────────────────────

def write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = "%s.%d.tmp" % (path, os.getpid())
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except OSError as exc:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise Refusal("%s could not be written: %s." % (path, exc.strerror))


def read_settings(root):
    path = os.path.join(root, SETTINGS_FILE)
    if not os.path.lexists(path):
        return {}, False
    if os.path.islink(path) or not os.path.isfile(path):
        raise Refusal("%s is not a regular file: nothing is changed." % SETTINGS_FILE)
    try:
        with open(path, encoding="utf-8-sig") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        raise Refusal("%s cannot be read as JSON (%s): nothing is changed - fix it, then switch again." % (SETTINGS_FILE, str(exc).splitlines()[0]))
    if not isinstance(data, dict) or any(not isinstance(data.get(k, {}), dict) for k in ("env", "skillOverrides")):
        raise Refusal("%s is not a JSON object whose env and skillOverrides are objects: nothing is changed." % SETTINGS_FILE)
    return data, True


def read_owned(root):
    try:
        with open(os.path.join(root, OWNED_FILE), encoding="utf-8") as handle:
            data = json.load(handle)
        return {k: [x for x in data.get(k, []) if isinstance(x, str)] for k in ("env", "skillOverrides")}
    except (OSError, ValueError, AttributeError):
        return {"env": [], "skillOverrides": []}


def plan_settings(settings, owned, wanted):
    """The new settings, one line per section changed, and per section the wanted keys kept as they
    were. Keys owned last time and no longer wanted are removed; a wanted key that is there and was
    not owned is the user's: neither changed nor removed, nor owned from now on; every other key is
    left as it is, in its place."""
    new = json.loads(json.dumps(settings))
    changes, kept = [], {}
    for section in ("env", "skillOverrides"):
        had = section in new
        current = new.get(section, {})
        want = wanted[section]
        added, removed, changed = [], [], []
        for key in owned[section]:
            if key in current and key not in want:
                del current[key]
                removed.append(key)
        kept[section] = {k: current[k] for k in want if k in current and k not in owned[section]}
        for key, value in want.items():
            if key in kept[section]:
                continue
            if key not in current:
                added.append(key)
            elif current[key] != value:
                changed.append(key)
            current[key] = value
        if current or (had and not removed):
            new[section] = current
        elif had:
            del new[section]        # emptied of the keys this script had written
        if added or removed or changed:
            changes.append("%s %s" % (section, " ".join(["+%s=%s" % (k, want[k]) for k in added] +
                                                       ["~%s=%s" % (k, want[k]) for k in changed] +
                                                       ["-%s" % k for k in removed])))
    return new, changes, kept


def linked_parent(root, targets):
    """The first folder between the root and a target that is a symbolic link, or None. git does not
    look through a link (`git ls-files -- .claude/x` finds nothing under a tracked `.claude -> cfg`)
    and a write follows it: into tracked files, or out of the space (`~/.claude`). With no link on
    the way, a target cannot leave the root."""
    seen = set()
    for target in targets:
        parts = target.split("/")[:-1]
        for i in range(len(parts), 0, -1):
            folder = "/".join(parts[:i])
            if folder in seen:
                break
            seen.add(folder)
            if os.path.islink(os.path.join(root, folder)):
                return folder
    return None


def tracked(root, targets):
    link = linked_parent(root, targets)
    if link:
        raise Refusal("%s is a symbolic link in %s: git does not see the files behind it and a write would follow it - "
                      "the harness never writes through a link. Nothing is changed." % (link, root))
    rc, out, err = git(root, "-c", "core.quotepath=off", "ls-files", "--cached", "-z", "--", *targets)
    if rc != 0:
        raise Refusal("git ls-files failed in %s: %s" % (root, (err.strip().splitlines() or ["?"])[0]))
    return [p for p in out.split("\0") if p]


def run_sync(root):
    script = os.environ.get("HARNESS_SYNC_SCRIPT") or "/usr/local/bin/sync-harness.sh"
    if not os.path.isfile(script):
        say("sync-harness.sh is not here (%s): the files of the profile are deployed at the next container start." % script)
        return None
    env = dict(os.environ, ORKEON_WORKSHOP=root)
    run = subprocess.run(["bash", script], capture_output=True, text=True, env=env)
    lines = [l for l in (run.stdout + run.stderr).splitlines() if l.strip()]
    if run.returncode != 0:
        say(*(lines[-5:] or ["sync-harness.sh failed (exit %d)." % run.returncode]))
        raise (Refusal if run.returncode == 2 else Broken)("the synchronisation did not complete (exit %d)." % run.returncode)
    summary = [l for l in lines if l.startswith("[harness] ") and re.search(r"synchronised into|up to date|Nothing deployed", l)]
    say(*(summary[-1:] or lines[-1:]))
    m = re.search(r"(\d+) added, \d+ updated, (\d+) removed", summary[-1] if summary else "")
    return bool(m and (int(m.group(1)) or int(m.group(2))))


# ── Commands ─────────────────────────────────────────────────────────────────────────────────

def context(defs, root, spec=None, space=None):
    found, why = detect_space(root)
    space = space or found
    where = "argument"
    if spec is None:
        spec, where = active_profile(root)
    if space == "unknown":
        raise Refusal("%s: no profile applies here. Mount the workshop or the checkout on $ORKEON_WORKSHOP, "
                      "or run in it (HARNESS_PROFILE sets the first profile at container start)." % why)
    origin = origin_of(root) if space == "source" else ""
    return spec, where, space, origin


def cmd_resolve(defs, root, space, manifest):
    found, _ = detect_space(root)
    space = space or found
    print("space %s" % space)
    if space == "unknown":
        print("refused not a workshop nor the top of a git work tree")
        return 2
    spec, where = active_profile(root)
    origin = origin_of(root) if space == "source" else ""
    note = ""
    try:
        res = resolve(defs, defs.profile(spec, root), space, origin)
    except Refusal as exc:
        if space != "workshop" or spec == "user":
            print("profile %s" % spec)
            print("refused %s" % exc)
            return 2
        note = "%s (%s), user applies" % (exc, where)
        res = resolve(defs, defs.profiles["user"], space, origin)
    print("profile %s" % res["profile"]["name"])
    print("packs %s" % " ".join(res["packs"]))
    print("skills %s" % " ".join(sorted(res["extra"])))
    if note:
        print("note %s" % note)
    if manifest:
        lines = read_manifest(manifest[0])
        keep = set(deployed_files(defs, res, [rel for rel, _ in lines]))
        with open(manifest[1], "w", encoding="utf-8") as handle:
            handle.writelines(line + "\n" for rel, line in lines if rel in keep)
    return 0


def describe(res):
    left = "; left out: %s" % ", ".join("%s (%s)" % lw for lw in res["left"]) if res["left"] else ""
    extra = "; skills without their pack: %s" % ", ".join(sorted(res["extra"])) if res["extra"] else ""
    return "packs %s%s%s" % (", ".join(res["packs"]), left, extra)


def cmd_show(defs, root):
    spec, where, space, origin = context(defs, root)
    res = resolve(defs, defs.profile(spec, root), space, origin)
    say("%s (%s) in the %s space %s." % (spec, where, space, root),
        describe(res) + ".",
        "switches: %s." % (", ".join("%s=%s" % kv for kv in sorted(res["switches"].items())) or "none"))
    return 0


def cmd_list(defs, root):
    found, why = detect_space(root)
    origin = origin_of(root) if found == "source" else ""
    say("space: %s%s." % (found, " - " + why if why else ""))
    for name in defs.profile_names(root):
        try:
            prof = defs.profile(name, root)
            verdict = "fits here" if found != "unknown" and profile_fits(defs, prof, found, origin) else "not here"
        except (Refusal, Broken) as exc:
            prof, verdict = {"packs": [], "description": str(exc)}, "broken"
        say("profile %-8s %-9s [%s] %s" % (name, verdict, ", ".join(prof["packs"]), prof["description"]))
    for name in sorted(defs.packs):
        d = defs.packs[name]
        say("pack    %-20s %s%s" % (name, "/".join(d["spaces"]), " (repository: %s)" % ", ".join(r.pattern for r in d["repos"]) if d["repos"] else ""))
    say("custom:<pack>,<pack> takes packs by hand; core is always added.")
    return 0


def cmd_check(defs):
    if defs.files is None:
        raise Broken("--check needs the harness tree, not a deployed copy.")
    problems, count, targets, skills = [], {}, {}, {}
    for rel in defs.files:
        try:
            pack = defs.pack_of(rel)
        except Broken as exc:
            problems.append(str(exc))
            continue
        if pack is None:
            problems.append("%s belongs to no pack." % rel)
            continue
        count[pack] = count.get(pack, 0) + 1
        target = target_of(rel)
        if target in targets:
            problems.append("%s and %s both land on %s." % (targets[target], rel, target))
        targets[target] = rel
        m = SKILL_RE.match(rel)
        if m and skills.setdefault(m.group(1), pack) != pack:
            problems.append("the skill %s is in %s and %s." % (m.group(1), skills[m.group(1)], pack))
        if pack != defs.remainder and rel in SEEDS:
            problems.append("the seed %s is outside %s." % (rel, defs.remainder))
    for name, prof in defs.profiles.items():
        unknown = [s for s in prof["skills"] if s not in defs.skills]
        if unknown:
            problems.append("profile %s names unknown skill(s) %s." % (name, ", ".join(unknown)))
    try:
        merge_switches(defs, sorted(defs.packs))
    except Broken as exc:
        problems.append(str(exc))
    for name in sorted(defs.packs):
        if name not in count and name != defs.remainder:
            count[name] = 0
    say("check: %d files; %s." % (len(defs.files), ", ".join("%s %d" % kv for kv in sorted(count.items()))))
    if problems:
        say(*problems)
        return 1
    say("check: every file belongs to exactly one pack, no two land on one path, the switches of every union resolve.")
    return 0


def cmd_switch(defs, root, spec, dry_run, no_sync):
    if not PROFILE_RE.match(spec):
        raise Refusal("not a profile name: a name (user, dev...) or custom:<pack>,<pack>.")
    if not defs.complete:
        raise Refusal("the harness tree is not here (no %s): switch inside the orkeon-workshop container." % DEFAULT_STAGING)
    spec, _, space, origin = context(defs, root, spec)
    res = resolve(defs, defs.profile(spec, root), space, origin)
    files = deployed_files(defs, res, defs.files)
    # What the synchronisation removes is written too: a file deployed last time that git tracks now.
    removed = removed_targets(root, files)
    if space == "source":
        found = tracked(root, [target_of(rel) for rel in files] + sorted(removed) + list(STATE_FILES))
        if found:
            raise Refusal("%s is tracked by git in %s (%d tracked target(s)): the harness never writes a tracked file (D51). Nothing is changed." % (found[0], root, len(found)))
    settings, existed = read_settings(root)
    owned = read_owned(root)
    wanted = {"env": res["switches"], "skillOverrides": overrides(defs, res, root, removed)}
    new, changes, kept = plan_settings(settings, owned, wanted)
    mine = {s: sorted(k for k in wanted[s] if k not in kept[s]) for s in wanted}
    held = ["%s %s" % (s, " ".join("%s=%s" % (k, v) for k, v in kept[s].items() if v != wanted[s][k]))
            for s in ("env", "skillOverrides") if any(v != wanted[s][k] for k, v in kept[s].items())]
    current, _ = read_profile_file(root)
    verb = "would be" if dry_run else "is"
    say("%s %s the profile of the %s space %s%s - %s." % (spec, verb, space, root,
        " (was %s)" % current if current and current != spec else "", describe(res)))
    say("%s: %s." % (SETTINGS_FILE, "; ".join(changes) if changes else "unchanged"))
    if held:
        say("%s: kept as set before the switch (not the profile's): %s." % (SETTINGS_FILE, "; ".join(held)))
    if dry_run:
        say("dry run: %d files of the harness would be deployed; nothing is written." % len(files))
        return 0

    def write(new, mine):
        if new != settings:
            write_atomic(os.path.join(root, SETTINGS_FILE), json.dumps(new, indent=2, ensure_ascii=False) + "\n")
        write_atomic(os.path.join(root, OWNED_FILE),
                     json.dumps(dict({"profile": spec}, **mine), indent=2) + "\n")

    write(new, mine)
    write_atomic(os.path.join(root, PROFILE_FILE), spec + "\n")
    moved = None if no_sync else run_sync(root)
    # Once the synchronisation ran, an off it made pointless (the skill's folder is gone) is dropped.
    stale = [k for k in mine["skillOverrides"] if wanted["skillOverrides"][k] == "off"
             and not os.path.isdir(os.path.join(root, ".claude", "skills", k))] if moved is not None else []
    if stale:
        left = {"env": wanted["env"], "skillOverrides": {k: v for k, v in wanted["skillOverrides"].items() if k not in stale}}
        write(plan_settings(new, mine, left)[0], {s: [k for k in mine[s] if k not in stale] for s in mine})
    if no_sync:
        say("--no-sync: the files of the profile are deployed by the next sync-harness.sh.")
    if moved or any(c.startswith("skillOverrides") for c in changes):
        say("restart Claude Code (/exit, then claude) to load the skills, subagents and rules of the profile; the switches apply at once.")
    return 0


def main(argv):
    args, flags, manifest, space = [], set(), None, None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--manifest" and i + 2 < len(argv):
            manifest = (argv[i + 1], argv[i + 2])
            i += 3
            continue
        if a == "--space" and i + 1 < len(argv) and argv[i + 1] in SPACES:
            space = argv[i + 1]
            i += 2
            continue
        if a in ("--list", "--show", "--dry-run", "--no-sync", "--resolve", "--check", "-h", "--help"):
            flags.add(a)
        elif a.startswith("-"):
            raise Refusal("unknown option %s - usage: workshop-profile [<profile> | custom:<packs>] [--dry-run] [--no-sync] | --list | --show." % a)
        else:
            args.append(a)
        i += 1
    if flags & {"-h", "--help"}:
        say("usage: workshop-profile [<profile> | custom:<pack>,<pack>] [--dry-run] [--no-sync] | --list | --show.")
        return 0
    if len(args) > 1:
        raise Refusal("one profile at a time (got %d arguments)." % len(args))
    root = workshop_root()
    defs = Defs(*harness_dir())
    if "--resolve" in flags:
        return cmd_resolve(defs, root, space, manifest)
    if "--check" in flags:
        return cmd_check(defs)
    if "--list" in flags:
        return cmd_list(defs, root)
    if not args or "--show" in flags:
        return cmd_show(defs, root)
    return cmd_switch(defs, root, args[0], "--dry-run" in flags, "--no-sync" in flags)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Refusal as exc:
        say(str(exc))
        sys.exit(2)
    except Broken as exc:
        say(str(exc))
        sys.exit(1)
