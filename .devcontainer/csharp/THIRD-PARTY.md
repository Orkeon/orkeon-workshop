# Third-party material in the .NET templates

## Orkeon

The four templates (`OrkeonTool/`, `OrkeonPlugin/`, `OrkeonRunner/`, `OrkeonCrewHost/`) and
`orkeon-studio-check` (`OrkeonStudioCheck/`) carry the same convention files, so that code written
from them would pass the CI of the Orkeon repository. Those files, and two test doubles, are copied
or adapted from that repository (<https://github.com/Orkeon/orkeon>, tag `v1.0.0-rc.4`; the
Orkeon files listed below are the same on `main` at 80fdefe, except `Directory.Packages.props`,
where `main` adds the pins of the e-mail tools and of `Microsoft.Extensions.Configuration.Binder`
and drops that of the OpenTelemetry console exporter, none of which the templates use, and the
root `Directory.Build.props`, where it adds a comment), which is distributed under the MIT licence:

```
MIT License

Copyright (c) 2024-2026 Orkeon Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### What comes from the Orkeon repository

| Template file | Orkeon file | What changed |
|---|---|---|
| `.editorconfig` | `.editorconfig` | nothing: a verbatim copy |
| `tests/.editorconfig` | `tests/.editorconfig` | comments translated to English; the rules unchanged |
| `global.json` | `global.json` | nothing: a verbatim copy |
| `Directory.Packages.props` | `Directory.Packages.props` | reduced to the packages the templates use, at the versions Orkeon pins; the per-assembly Orkeon packages of the local feed and the offline switch of the NuGet audit added |
| `Directory.Build.props` (root, `src/`, `tests/`) | the root, `src/` and `tests/` `Directory.Build.props` | reduced to what a consumer project needs; the build for the machine's own runtime added |
| `nuget.config` | `nuget.config` | the source mapping kept; the local feed added for `Orkeon.*` |
| `tests/*/Doubles/FakeFileSystemService.cs` (`OrkeonTool/`, `OrkeonPlugin/`) | `tests/shared/Orkeon.Tests.Shared/FileSystem/FakeFileSystemService.cs` | the namespace, and a header naming the origin |

A tool or a team created from a template carries these files: keep this notice with them
(`OrkeonTool/new-tool.sh` copies it into the new tool).

The code of the templates themselves — the sample tool, the plugin, the runner, the team host,
`orkeon-studio-check` and their tests, the two test doubles above aside — was written for Orkeon
Workshop.
