# The tests of install/start-workshop.ps1, on a fake docker: a function, which PowerShell calls before
# any docker.exe. No Docker, no network, no Pester. Windows PowerShell 5.1 and PowerShell 7 alike:
#   pwsh -NoProfile -File install/tests/start-workshop.Tests.ps1         (or powershell -File ...)
# Exit 0 when every case passes.
$ErrorActionPreference = "Continue"
$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\start-workshop.ps1"
$script = [System.IO.Path]::GetFullPath($script.Replace('\', [System.IO.Path]::DirectorySeparatorChar))
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("start-workshop-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
$savedProfileDir = $env:USERPROFILE
$savedPath = $env:PATH
$failures = 0

# The fake docker. Its state, $Fake: C[<name>] = @{Status; Binds; Env; Gpu} (a container),
# I[<image>] = its env lines, V[<volume>], Gpu (the probe succeeds), Down (no daemon), Ps.
function global:docker {
    $line = $args -join " "
    $global:FakeLog += , $line
    $global:LASTEXITCODE = 0
    $f = $global:Fake
    switch ($args[0]) {
        "info" { if ($f.Down) { $global:LASTEXITCODE = 1 } }
        "inspect" {
            $c = $f.C[$args[3]]
            if (-not $c) { $global:LASTEXITCODE = 1; return }
            $fmt = $args[2]
            if ($fmt -like "*State.Status*") { return $c.Status }
            if ($fmt -like "*HostConfig.Binds*") { return $c.Binds }
            if ($fmt -like "*Config.Env*") { return $c.Env }
            if ($fmt -like "*DeviceRequests*") { if ($c.Gpu) { return "1" } else { return "0" } }
            if ($fmt -like "*.Image*") { return "sha256:old" }
        }
        "image" {
            $img = $args[$args.Count - 1]
            if (-not $f.I.ContainsKey($img)) { $global:LASTEXITCODE = 1; return }
            if ($line -like "*Config.Env*") { return $f.I[$img] }
        }
        "volume" {
            if ($args[1] -eq "inspect") { if (-not $f.V.ContainsKey($args[2])) { $global:LASTEXITCODE = 1 } }
            else { $f.V[$args[2]] = $true; return $args[2] }
        }
        "run" { if ($line -like "*--entrypoint true*" -and -not $f.Gpu) { $global:LASTEXITCODE = 1 } }
        "ps" { return $f.Ps }
    }
}
function global:Read-Host { return "" }

function Setup {
    $global:Fake = @{ C = @{}; I = @{}; V = @{}; Gpu = $false; Down = $false; Ps = @() }
    $global:FakeLog = @()
    $script:wsHome = Join-Path $tmp ([guid]::NewGuid())
    New-Item -ItemType Directory -Path $script:wsHome | Out-Null
    $env:USERPROFILE = $script:wsHome
}
function Start-Case([string]$name, [hashtable]$arguments) {
    $script:caseName = $name
    $global:LASTEXITCODE = 0
    $errors = $Error.Count
    $script:out = (& $script @arguments *>&1 | Out-String)
    $script:rc = $LASTEXITCODE
    if ($Error.Count -gt $errors) { Fail "PowerShell error: $($Error[0])" }
}
function Fail([string]$why) {
    Write-Host "FAIL ${caseName}: $why"
    Write-Host (($out -split "`n" | ForEach-Object { "    | $_" }) -join "`n")
    $script:failures++
}
function ExpectRc([int]$code) { if ($rc -ne $code) { Fail "exit $rc, expected $code" } }
function ExpectOut([string]$text) { if (-not $out.Contains($text)) { Fail "output lacks: $text" } }
function RefuteOut([string]$text) { if ($out.Contains($text)) { Fail "output has: $text" } }
function ExpectLog([string]$text) { if (-not ($FakeLog | Where-Object { $_.Contains($text) })) { Fail "docker not called with: $text" } }
function RefuteLog([string]$text) { if ($FakeLog | Where-Object { $_.Contains($text) }) { Fail "docker called with: $text" } }
function LastCall { if ($FakeLog.Count) { return $FakeLog[$FakeLog.Count - 1] } else { return "" } }
function ExpectLast([string]$text) { if (-not (LastCall).Contains($text)) { Fail "last call lacks: $text (was: $(LastCall))" } }
function RefuteLast([string]$text) { if ((LastCall).Contains($text)) { Fail "last call has: $text" } }
function Container([string]$name, [string]$status, [string[]]$binds) { $Fake.C[$name] = @{ Status = $status; Binds = $binds; Env = @(); Gpu = $false } }
function Touch([string]$path) { New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null; New-Item -ItemType File -Force $path | Out-Null }

try {
    Setup; $fakeDocker = ${function:global:docker}; Remove-Item Function:\docker
    $env:PATH = $tmp
    Start-Case "docker missing" @{}; ExpectRc 1; ExpectOut "Docker is not installed"
    $env:PATH = $savedPath; Set-Item function:global:docker $fakeDocker

    Setup; $Fake.Down = $true
    Start-Case "docker not answering" @{}; ExpectRc 1; ExpectOut "Docker does not answer"; RefuteLog "run"

    Setup; $Fake.Gpu = $true; $w = Join-Path $wsHome "Orkeon"
    Start-Case "first start with a GPU" @{ Folder = $w }; ExpectRc 0
    if (-not (Test-Path $w)) { Fail "folder not created" }
    ExpectLog "pull ghcr.io/orkeon/orkeon-workshop:latest"
    ExpectLog "tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop"
    ExpectLog "volume create my-orkeon-workshop-claude"; ExpectLog "volume create my-orkeon-workshop-worktrees"
    ExpectOut "NVIDIA GPU found"
    ExpectLast "run -it --init --name my-orkeon-workshop --gpus=all"
    ExpectLast "-v cc-ollama:/home/node/.ollama/models"
    ExpectLast "-v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude"
    ExpectLast "-v my-orkeon-workshop-worktrees:/worktrees -e HARNESS_WORKTREE_ROOT=/worktrees"
    ExpectLast "-v ${w}:/workspace"
    ExpectLast "-e OLLAMA_DEFAULT_MODEL=qwen3:8b -e HARNESS_PROFILE=user -e DOCKER_MODE=socket orkeon-workshop"

    Setup; $Fake.I["orkeon-workshop"] = @()
    Start-Case "first start without a GPU, the default folder" @{}; ExpectRc 0
    ExpectOut "No usable NVIDIA GPU"; RefuteLog "pull"; RefuteLast "--gpus=all"
    ExpectLast ("-v " + (Join-Path $wsHome "Orkeon") + ":/workspace")

    Setup; $Fake.I["orkeon-workshop"] = @(); $Fake.Gpu = $true
    Start-Case "no model, no gpu, another name" @{ NoModel = $true; NoGpu = $true; Name = "second"; Folder = (Join-Path $wsHome "w2") }; ExpectRc 0
    RefuteLog "--entrypoint true"; RefuteLast "OLLAMA_DEFAULT_MODEL"; RefuteLast "--gpus=all"
    ExpectLast "--name second"; ExpectLast "-v second-claude:/home/node/.claude"

    Setup; $d = Join-Path $wsHome "docs"; New-Item -ItemType Directory $d | Out-Null; New-Item -ItemType File (Join-Path $d "letter.txt") | Out-Null
    Start-Case "a folder of other files" @{ Folder = $d }; ExpectRc 1; ExpectOut "holds other files (letter.txt"; RefuteLog "run -it"

    Setup; $Fake.I["orkeon-workshop"] = @(); $d = Join-Path $wsHome "W"; New-Item -ItemType Directory (Join-Path $d "teams") | Out-Null; New-Item -ItemType File (Join-Path $d "notes.md") | Out-Null
    Start-Case "a workshop that has teams" @{ Folder = $d }; ExpectRc 0; ExpectLast "-v ${d}:/workspace"

    # The folder rule with .git (D87): a project checkout is refused under user as other files, with
    # the profile hint; this repository's checkout is told to take a source profile; a workshop that git
    # versions - teams/, or nothing but README*/LICENSE* - is accepted as without .git.
    Setup; $d = Join-Path $wsHome "thing"; New-Item -ItemType Directory (Join-Path $d ".git") | Out-Null; Touch (Join-Path $d "README.md"); Touch (Join-Path $d "src\main.c")
    Start-Case "a project checkout with the user profile" @{ Folder = $d }; ExpectRc 1; ExpectOut "holds other files (src"; ExpectOut "-Profile dev"; RefuteLog "run -it"
    $Fake.I["orkeon-workshop"] = @()
    Start-Case "a git checkout with dev" @{ Folder = $d; Profile = "dev" }; ExpectRc 0; ExpectLast "-e HARNESS_PROFILE=dev"

    Setup; $d = Join-Path $wsHome "ws"; New-Item -ItemType Directory (Join-Path $d ".git") | Out-Null; New-Item -ItemType Directory (Join-Path $d ".devcontainer") | Out-Null
    Touch (Join-Path $d "README.md"); Touch (Join-Path $d "install\start-workshop.ps1"); Touch (Join-Path $d "docs\README.md")
    Start-Case "this repository's checkout with the user profile, by its files" @{ Folder = $d }; ExpectRc 1
    ExpectOut "is a git checkout: give it a profile made for one"; RefuteOut "holds other files"; RefuteLog "run -it"

    if (Get-Command git -CommandType Application -ErrorAction Ignore) {
        Setup; $d = Join-Path $wsHome "ws2"; New-Item -ItemType Directory $d | Out-Null
        git -C $d init -q 2>$null; git -C $d remote add origin https://github.com/Orkeon/orkeon-workshop.git 2>$null
        Touch (Join-Path $d "README.md"); Touch (Join-Path $d "docs\README.md")
        Start-Case "this repository's checkout with the user profile, by its origin" @{ Folder = $d }; ExpectRc 1
        ExpectOut "is a git checkout: give it a profile made for one"; RefuteLog "run -it"
    }

    Setup; $Fake.I["orkeon-workshop"] = @(); $d = Join-Path $wsHome "W"; New-Item -ItemType Directory (Join-Path $d ".git") | Out-Null; New-Item -ItemType Directory (Join-Path $d "teams") | Out-Null
    Touch (Join-Path $d "README.md"); Touch (Join-Path $d ".gitignore")
    Start-Case "a workshop that git versions, with teams" @{ Folder = $d }; ExpectRc 0; ExpectLast "-v ${d}:/workspace"; ExpectLast "-e HARNESS_PROFILE=user"

    Setup; $Fake.I["orkeon-workshop"] = @(); $d = Join-Path $wsHome "W"; New-Item -ItemType Directory (Join-Path $d ".git") | Out-Null
    Touch (Join-Path $d "README.md"); Touch (Join-Path $d "LICENSE"); Touch (Join-Path $d ".gitattributes")
    Start-Case "a fresh git repository holding only README and LICENSE" @{ Folder = $d }; ExpectRc 0; ExpectLast "-v ${d}:/workspace"; ExpectLast "-e HARNESS_PROFILE=user"

    Setup; $d = Join-Path $wsHome "W"; New-Item -ItemType Directory (Join-Path $d ".git") | Out-Null; Touch (Join-Path $d "README.md"); Touch (Join-Path $d "notes.txt")
    Start-Case "a fresh git repository holding one more file" @{ Folder = $d }; ExpectRc 1; ExpectOut "holds other files (notes.txt"; RefuteLog "run -it"

    Setup
    Start-Case "a wrong profile" @{ Profile = "<profile>" }; ExpectRc 2

    Setup; Container "my-orkeon-workshop" "exited" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "an existing stopped container" @{}; ExpectRc 0; ExpectLast "start -ai my-orkeon-workshop"; RefuteLog "pull"

    Setup; Container "my-orkeon-workshop" "running" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "an existing running container" @{}; ExpectRc 0; ExpectLast "exec -it --user node my-orkeon-workshop zsh"

    # One line is one named container (D87): another -Folder or -Profile given with the name of an
    # existing container is refused with 2; the same folder written otherwise, or the same profile, opens it.
    Setup; Container "my-orkeon-workshop" "running" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "an existing container, another -Folder: refused" @{ Folder = "C:\elsewhere" }; ExpectRc 2
    ExpectOut "already works on C:\Users\you\Orkeon, not on C:\elsewhere"; ExpectOut "-Name <other-name>"; ExpectOut "docker rm my-orkeon-workshop"
    RefuteLog "exec"; RefuteLog "start -ai"

    # Docker Desktop records C:\Users\you\Orkeon as /run/desktop/mnt/host/c/Users/you/Orkeon.
    Setup; Container "my-orkeon-workshop" "exited" @("/run/desktop/mnt/host/c/Users/you/Orkeon:/workspace")
    Start-Case "an existing container, the same folder as Docker Desktop records it" @{ Folder = "C:\Users\You\Orkeon\" }; ExpectRc 0; ExpectLast "start -ai my-orkeon-workshop"
    Start-Case "an existing container, the same folder with forward slashes" @{ Folder = "c:/users/you/orkeon" }; ExpectRc 0; ExpectLast "start -ai my-orkeon-workshop"
    Setup; Container "my-orkeon-workshop" "exited" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "an existing container, the same folder in another case, with a trailing slash" @{ Folder = "c:\users\YOU\orkeon\" }; ExpectRc 0; ExpectLast "start -ai my-orkeon-workshop"
    Setup; Container "my-orkeon-workshop" "exited" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "an existing container, another drive: refused" @{ Folder = "D:\Users\you\Orkeon" }; ExpectRc 2; RefuteLog "start -ai"

    Setup; Container "my-orkeon-workshop" "exited" @("C:\Users\you\Orkeon:/workspace"); $Fake.C["my-orkeon-workshop"].Env = @("HARNESS_PROFILE=dev", "DOCKER_MODE=socket")
    Start-Case "an existing container, the same -Profile" @{ Profile = "dev" }; ExpectRc 0; ExpectLast "start -ai my-orkeon-workshop"

    Setup; Container "my-orkeon-workshop" "exited" @("C:\Users\you\Orkeon:/workspace"); $Fake.C["my-orkeon-workshop"].Env = @("HARNESS_PROFILE=user", "DOCKER_MODE=socket")
    Start-Case "an existing container, another -Profile: refused" @{ Profile = "dev" }; ExpectRc 2; ExpectOut "was created with the profile user, not dev"
    ExpectOut "-Name <other-name>"; ExpectOut "docker rm my-orkeon-workshop"; ExpectOut "workshop-profile dev"; RefuteLog "start -ai"

    Setup; Container "my-orkeon-workshop" "exited" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "an existing container that records no profile" @{ Profile = "dev" }; ExpectRc 0; ExpectOut "records no profile"; ExpectLast "start -ai my-orkeon-workshop"

    Setup
    Container "my-orkeon-workshop" "running" @("/var/run/docker.sock:/var/run/docker-host.sock", "cc-ollama:/home/node/.ollama/models", "my-claude:/home/node/.claude", "C:\Users\you\My Orkeon:/workspace")
    $Fake.C["my-orkeon-workshop"].Env = @("PATH=/usr/bin", "NODE_VERSION=24", "CLAUDE_CONFIG_DIR=/home/node/.claude", "OLLAMA_DEFAULT_MODEL=llama3.2", "HARNESS_PROFILE=user", "ZAI_API_KEY=secret", "OTHER_KEY=x")
    $Fake.C["my-orkeon-workshop"].Gpu = $true
    $Fake.I["sha256:old"] = @("PATH=/usr/bin", "NODE_VERSION=24")
    $env:ZAI_API_KEY = "from-host"; Remove-Item env:OTHER_KEY -ErrorAction SilentlyContinue
    Start-Case "update" @{ Update = $true }; ExpectRc 0
    Remove-Item env:ZAI_API_KEY
    ExpectLog "pull ghcr.io/orkeon/orkeon-workshop:latest"; ExpectLog "stop my-orkeon-workshop"
    ExpectLog "tag sha256:old orkeon-workshop:previous"; ExpectLog "rename my-orkeon-workshop my-orkeon-workshop-old"
    ExpectLast "--gpus=all"; ExpectLast "-v my-claude:/home/node/.claude"; ExpectLast "-v C:\Users\you\My Orkeon:/workspace"
    ExpectLast "-e OLLAMA_DEFAULT_MODEL=llama3.2 -e HARNESS_PROFILE=user -e ZAI_API_KEY -e DOCKER_MODE=socket"
    RefuteLast "secret"; RefuteLast "from-host"
    ExpectOut "Not carried over (not set in this window): OTHER_KEY"; ExpectOut "-CleanUp"

    Setup; Container "my-orkeon-workshop" "exited" @("my-orkeon-workshop-claude:/home/node/.claude", "C:\Users\you\Orkeon:/workspace")
    Start-Case "update, model removed" @{ Update = $true; NoModel = $true }; ExpectRc 0; RefuteLog "stop"
    ExpectLast "-v C:\Users\you\Orkeon:/workspace"; RefuteLast "OLLAMA_DEFAULT_MODEL"; RefuteLast "--gpus=all"; RefuteLast "HARNESS_PROFILE"

    Setup; Container "my-orkeon-workshop" "exited" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "update without the Claude Code volume" @{ Update = $true }; ExpectRc 1; ExpectOut "#without-the-claude-code-volume"; RefuteLog "pull"

    Setup; Container "my-orkeon-workshop" "exited" @("shared-claude:/home/node/.claude", "C:\Users\you\Orkeon:/workspace")
    $Fake.Ps = @("my-orkeon-workshop", "orkeon-dev")
    Start-Case "update of a shared volume" @{ Update = $true }; ExpectRc 1; ExpectOut "shared with orkeon-dev"; RefuteLog "pull"

    Setup; Container "my-orkeon-workshop" "exited" @("my-orkeon-workshop-claude:/home/node/.claude", "C:\Users\you\Orkeon:/workspace")
    Container "my-orkeon-workshop-old" "exited" @("my-orkeon-workshop-claude:/home/node/.claude", "C:\Users\you\Orkeon:/workspace")
    Start-Case "update with an old container left" @{ Update = $true }; ExpectRc 1; ExpectOut "-CleanUp"; RefuteLog "pull"

    Setup
    Start-Case "update without a container" @{ Update = $true }; ExpectRc 1; ExpectOut "without -Update"

    Setup; $Fake.I["orkeon-workshop:previous"] = @()
    Container "my-orkeon-workshop" "running" @("C:\Users\you\Orkeon:/workspace"); Container "my-orkeon-workshop-old" "exited" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "clean-up" @{ CleanUp = $true }; ExpectRc 0; ExpectLog "rm my-orkeon-workshop-old"; ExpectLog "rmi orkeon-workshop:previous"

    Setup; Container "my-orkeon-workshop-old" "exited" @("C:\Users\you\Orkeon:/workspace")
    Start-Case "clean-up without the new container" @{ CleanUp = $true }; ExpectRc 1; RefuteLog "rm my-orkeon-workshop-old"

    Setup; $w = Join-Path $wsHome "Orkeon"
    Start-Case "dry run" @{ DryRun = $true; Folder = $w }; ExpectRc 0
    if (Test-Path $w) { Fail "folder created on a dry run" }
    RefuteLog "pull"; RefuteLog "volume create"; RefuteLog "run -it"
    ExpectOut "+ docker pull ghcr.io/orkeon/orkeon-workshop:latest"; ExpectOut "+ docker volume create my-orkeon-workshop-claude"
    ExpectOut "+ docker run -it --init --name my-orkeon-workshop"
} finally {
    $env:USERPROFILE = $savedProfileDir
    $env:PATH = $savedPath
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

if ($failures -eq 0) { Write-Host "start-workshop.ps1: every case passed"; exit 0 }
Write-Host "start-workshop.ps1: $failures failure(s)"
exit 1
