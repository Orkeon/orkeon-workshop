---
name: clean-restore
description: "Clean the bin/obj artifacts and restore the NuGet packages. Essential when a workspace is shared between Windows and WSL/Linux (or a devcontainer) and builds fail because of incompatible artifacts. Use this skill when someone asks to clean the project, restore the packages, fix build errors related to bin/obj, or prepare the environment after a platform switch — even if they simply say \"it doesn't compile anymore\" or \"clean and restore\"."
---

# Clean & Restore .NET

You clean the build artifacts and restore the NuGet dependencies of a .NET project shared across several environments (Windows, WSL, devcontainer).

## Why It Matters

When you work on the same .NET project from Windows and WSL (or a devcontainer), the `bin/` and `obj/` directories contain platform-specific build artifacts. These artifacts are incompatible across environments and cause cryptic restore/build failures. A full clean followed by a restore consistently fixes these problems.

## Steps

### 1. Check that the script exists

```bash
ls -l /usr/local/bin/clean-restore.sh
```

If the script does not exist, the container does not come from the devcontainer image: tell the user and stop.

### 2. Run the clean & restore on the project folder

Name the folder of the .NET project — the one holding its `.sln`/`.slnx` or `.csproj`: in a
workshop, a C# tool (`library/tools/csharp/<Name>/`); in a source project, its root. Never the
root of the workshop: the script refuses it, since the teams and their data are not build output.

```bash
bash /usr/local/bin/clean-restore.sh <project folder>
```

The script:
1. Deletes all `bin/` and `obj/` directories under the project folder
2. Configures NuGet with `nuget.org` and a local source `<project folder>/packages` (key `local`)
3. Runs `dotnet restore` in the project folder to download the dependencies again

**Private packages**: the `NUGET_LOCAL_PATTERNS` variable (prefixes separated by spaces, `,` or `;`) reserves these packages for the local source — they are never resolved from nuget.org (protection against dependency confusion):

```bash
NUGET_LOCAL_PATTERNS="Contoso.* Aspire.Hosting.Contoso*" bash /usr/local/bin/clean-restore.sh <project folder>
```

Without this variable, the local source accepts all packages (`*`) in addition to nuget.org. If the project depends on private packages placed in `<project folder>/packages` and the variable is not set in the environment, ask the user for their prefixes.

### 3. Verify success

- Confirm that no old `bin/` or `obj/` directory remains
- Check that `dotnet restore` finished without errors
- If errors persist, report them to the user in detail

### 4. Report the results

Tell the user what was cleaned and whether the restore succeeded.
