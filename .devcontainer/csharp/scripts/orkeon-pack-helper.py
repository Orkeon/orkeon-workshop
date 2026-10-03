#!/usr/bin/env python3
"""Companion of build-orkeon-packages.sh (standard library only).

  plan <src-dir> <project-path>...
      Walks the ProjectReference closure of the given root projects (analyzer-only
      references excluded) and prints it as JSON: one entry per project with its name,
      PackageId and csproj path. Every member of the closure is packed into the local
      feed, so a consumer never has to mix locally built assemblies with the NuGet.org
      umbrellas (decision D17).

  deps <nupkg>
      Prints the dependency ids declared by the nuspec inside a nupkg (one per line),
      for the manifest and for the feed verification.
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

PROJECT_REF = re.compile(r"<ProjectReference\s+([^>]*?)/?>", re.DOTALL)
ATTR = re.compile(r'(\w+)="([^"]*)"')
PACKAGE_ID = re.compile(r"<PackageId>\s*([^<\s]+)\s*</PackageId>")


def _project_refs(csproj: Path) -> list[tuple[Path, dict[str, str]]]:
    text = csproj.read_text(encoding="utf-8")
    refs = []
    for m in PROJECT_REF.finditer(text):
        attrs = {k: v for k, v in ATTR.findall(m.group(1))}
        include = attrs.get("Include")
        if not include:
            continue
        target = (csproj.parent / include.replace("\\", "/")).resolve()
        refs.append((target, attrs))
    return refs


def _package_id(csproj: Path) -> str:
    m = PACKAGE_ID.search(csproj.read_text(encoding="utf-8"))
    return m.group(1) if m else csproj.stem


def closure(roots: list[Path]) -> dict[str, Path]:
    seen: dict[str, Path] = {}
    stack = list(roots)
    while stack:
        p = stack.pop()
        if p.stem in seen:
            continue
        if not p.exists():
            sys.exit(f"error: project not found: {p}")
        seen[p.stem] = p
        for target, attrs in _project_refs(p):
            # Build-time only: the VFS analyzer and the source generator never become
            # a runtime dependency, so they are not part of what a consumer restores.
            if attrs.get("ReferenceOutputAssembly", "true").lower() == "false":
                continue
            if attrs.get("OutputItemType", "") == "Analyzer":
                continue
            stack.append(target)
    return seen


def cmd_plan(argv: list[str]) -> None:
    if len(argv) < 2:
        sys.exit("usage: plan <src-dir> <project-path>...")
    src = Path(argv[0]).resolve()
    roots = []
    for a in argv[1:]:
        p = Path(a) if Path(a).is_absolute() else src / a
        p = p.resolve()
        roots.append(p / f"{p.name}.csproj" if p.is_dir() else p)
    members = closure(roots)
    projects = [
        {"name": name, "packageId": _package_id(path), "path": str(path)}
        for name, path in sorted(members.items())
    ]
    print(json.dumps({"projects": projects}, indent=2))


def cmd_deps(argv: list[str]) -> None:
    if len(argv) != 1:
        sys.exit("usage: deps <nupkg>")
    with zipfile.ZipFile(argv[0]) as z:
        nuspec = next(n for n in z.namelist() if n.endswith(".nuspec") and "/" not in n)
        root = ET.fromstring(z.read(nuspec))
    ids = sorted({el.attrib["id"] for el in root.iter() if el.tag.split("}", 1)[-1] == "dependency"})
    print("\n".join(ids))


def main() -> None:
    commands = {"plan": cmd_plan, "deps": cmd_deps}
    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
