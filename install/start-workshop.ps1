# start-workshop.ps1 - start Orkeon Workshop on your computer (Windows), in one line (D86).
#
# Typed in PowerShell on your computer, never in the container:
#
#   irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1 | iex
#
# and, with options:
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Update
#
# The same behaviour as start-workshop.sh, its Linux twin: the first time, it checks Docker, asks for
# the folder of your workshop, downloads the image, tries the NVIDIA GPU and creates the container with
# the command of Install "Starting by hand" (D85); after that, the same line opens the container again.
# One line is one named container (D87): -Name says which, and a -Folder or -Profile given with it that
# differs from the container's (its bind on /workspace, its HARNESS_PROFILE) is refused with 2 rather
# than silently ignored. -Update moves it to the latest image, keeping the old one as <name>-old until
# -CleanUp.
#
#   -Folder <path>    the folder mounted on /workspace (asked, default %USERPROFILE%\Orkeon)
#   -Name <name>      the container (default my-orkeon-workshop)
#   -Profile <name>   the folder's first profile (default user, for a folder of teams; dev, release,
#                     docs, contrib, all for a git checkout to work on)
#   -Model <name>     the local model downloaded at the first start (default qwen3:8b)
#   -NoModel          no local model
#   -NoGpu            do not try the GPU
#   -Update           move the container to the latest image
#   -CleanUp          remove <name>-old and the previous image, once the updated container works
#   -DryRun           print the commands that change something instead of running them
#
# Windows PowerShell 5.1 and PowerShell 7 alike, ASCII only (5.1 reads a file without a BOM as ANSI).
# It never calls exit, which would close the window of `irm | iex`: it returns, and leaves its result
# in $LASTEXITCODE - 0 done, 1 refused or failed, 2 wrong option. Its literals change together with
# start-workshop.sh, whose header lists the pages that quote them.
param(
    [string]$Folder = "",
    [string]$Name = "my-orkeon-workshop",
    [Alias("Profile")][string]$HarnessProfile = "user",
    [string]$Model = "qwen3:8b",
    [switch]$NoModel,
    [switch]$NoGpu,
    [switch]$Update,
    [switch]$CleanUp,
    [switch]$DryRun
)

function Invoke-OrkeonWorkshop {
    param([string]$Folder, [bool]$FolderGiven, [string]$Name, [string]$HarnessProfile, [bool]$ProfileGiven,
          [string]$Model, [bool]$ModelGiven, [bool]$NoGpu, [bool]$Update, [bool]$CleanUp, [bool]$DryRun,
          [hashtable]$Outcome)

    $ErrorActionPreference = "Continue"

    $imageUrl = "ghcr.io/orkeon/orkeon-workshop:latest"
    $image = "orkeon-workshop"
    $docs = "https://orkeon.github.io/orkeon-workshop"
    $gpu = -not $NoGpu

    function Say([string]$text) { Write-Host "[workshop] $text" }
    function Fail([string]$text) { Write-Host "[workshop] $text" -ForegroundColor Red; return 1 }
    function Refuse([string]$text) { Write-Host "[workshop] $text" -ForegroundColor Red; return 2 }
    # A command that changes something: printed under -DryRun, run otherwise.
    function Run([string[]]$cmd) {
        if ($DryRun) { Write-Host ("+ docker " + ($cmd -join " ")); $global:LASTEXITCODE = 0; return }
        docker @cmd | Out-Null
    }
    # The last command, the one that takes the window over (the container's own): left in $Outcome
    # for the top of the script, where docker gets the console - a function's output is captured.
    function HandOver([string[]]$cmd) {
        $Outcome.HandOver = $cmd
        return 0
    }
    function StateOf([string]$n) {
        $s = docker inspect -f "{{.State.Status}}" $n 2>$null
        if ($LASTEXITCODE -ne 0) { return "" }
        return "$s".Trim()
    }
    # The source of a container's bind on $dest (/workspace, /home/node/.claude), as it was given.
    function BindSource([string]$n, [string]$dest) {
        $lines = docker inspect -f "{{range .HostConfig.Binds}}{{println .}}{{end}}" $n 2>$null
        foreach ($line in @($lines)) {
            $m = [regex]::Match("$line", "^(.*):" + [regex]::Escape($dest) + "(:[a-z,]+)?$")
            if ($m.Success) { return $m.Groups[1].Value }
        }
        return ""
    }
    function EnvNames([string[]]$lines) {
        return @($lines | Where-Object { $_ } | ForEach-Object { ("$_" -split "=", 2)[0] })
    }
    # The value of one variable given at the container's docker run (HARNESS_PROFILE, OLLAMA_DEFAULT_MODEL).
    function EnvOf([string]$n, [string]$var) {
        foreach ($l in @(docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" $n 2>$null)) {
            if ("$l" -like "$var=*") { return "$l".Substring($var.Length + 1) }
        }
        return ""
    }
    # A folder as it compares. Docker Desktop records C:\Users\you\Orkeon as
    # /run/desktop/mnt/host/c/Users/you/Orkeon: the drive letter, the separators, the case and the
    # trailing separator are put in one form on both sides.
    function NormalFolder([string]$p) {
        $p = "$p".Trim().Trim('"') -replace '/', '\'
        if ($p -match '^\\run\\desktop\\mnt\\host\\([A-Za-z])(\\.*)?$') { $p = $Matches[1] + ":" + $Matches[2] }
        elseif ($p -match '^~(\\.*)?$') { $p = $HOME + $Matches[1] }
        elseif ($p -notmatch '^([A-Za-z]:\\|\\)') { $p = Join-Path (Get-Location).Path $p }
        $p = $p.TrimEnd('\')
        if ($p -match '^[A-Za-z]:$') { $p += '\' }
        return $p.ToLowerInvariant()
    }
    # The git checkout of this repository: its own files, or its origin (git on this computer, if any).
    function IsThisRepository([string]$folder) {
        if ((Test-Path -LiteralPath (Join-Path $folder ".devcontainer") -PathType Container) -and
            (Test-Path -LiteralPath (Join-Path (Join-Path $folder "install") "start-workshop.ps1"))) { return $true }
        $git = Get-Command git -CommandType Application -ErrorAction Ignore | Select-Object -First 1
        if (-not $git) { return $false }
        # git is run through .NET so that what it writes on stderr ("not a git repository") never
        # becomes a PowerShell error: Windows PowerShell 5.1 records one even behind 2>$null.
        $info = New-Object System.Diagnostics.ProcessStartInfo
        $info.FileName = $git.Source
        $info.Arguments = '-C "' + $folder + '" remote get-url origin'
        $info.UseShellExecute = $false
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $info.CreateNoWindow = $true
        try {
            $p = [System.Diagnostics.Process]::Start($info)
            $origin = $p.StandardOutput.ReadToEnd().Trim()
            $null = $p.StandardError.ReadToEnd()
            $p.WaitForExit()
            $code = $p.ExitCode
        } catch { return $false }
        return ($code -eq 0 -and $origin -match '(?i)github\.com[:/]Orkeon/orkeon-workshop(\.git)?/?$')
    }
    function PullImage {
        Say "Downloading the image (about 19 GB the first time: it takes a while)..."
        if ($DryRun) { Write-Host "+ docker pull $imageUrl"; $global:LASTEXITCODE = 0 } else { docker pull $imageUrl | Out-Host }
        if ($LASTEXITCODE -ne 0) { return $false }
        Run @("tag", $imageUrl, $image)
        return $true
    }
    function CreateVolumes([string[]]$volumes) {
        foreach ($v in $volumes) {
            docker volume inspect $v *> $null
            if ($LASTEXITCODE -ne 0) { Run @("volume", "create", $v) }
        }
    }
    # The docker run of Install "Starting by hand"; $profile is passed as HARNESS_PROFILE, none when empty.
    function StartNew([string]$folder, [string]$claudeVolume, [bool]$gpu, [string]$model, [string]$profile, [string[]]$extraEnv) {
        $a = @("run", "-it", "--init", "--name", $Name)
        if ($gpu) { $a += "--gpus=all" }
        $a += @("--cap-add=NET_ADMIN", "--cap-add=NET_RAW", "--add-host=host.docker.internal:host-gateway",
            "-v", "/var/run/docker.sock:/var/run/docker-host.sock",
            "-v", "cc-ollama:/home/node/.ollama/models",
            "-v", "${claudeVolume}:/home/node/.claude", "-e", "CLAUDE_CONFIG_DIR=/home/node/.claude",
            "-v", "${Name}-worktrees:/worktrees", "-e", "HARNESS_WORKTREE_ROOT=/worktrees",
            "-v", "${folder}:/workspace")
        if ($model) { $a += @("-e", "OLLAMA_DEFAULT_MODEL=$model") }
        if ($profile) { $a += @("-e", "HARNESS_PROFILE=$profile") }
        $a += $extraEnv
        $a += @("-e", "DOCKER_MODE=socket", $image)
        return HandOver $a
    }

    if ($Name -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$') { Say "-Name: letters, digits, '.', '_' and '-' only"; return 2 }
    if ($HarnessProfile -notmatch '^(custom:[a-z][a-z0-9-]*(,[a-z][a-z0-9-]*)*|[a-z][a-z0-9-]*)$') { Say "-Profile: not a profile name: $HarnessProfile"; return 2 }

    # 1. Docker
    if (-not (Get-Command docker -ErrorAction Ignore)) {
        return Fail "Docker is not installed. Install Docker Desktop (https://docs.docker.com/desktop/setup/install/windows-install/), start it, then type this line again."
    }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        return Fail "Docker does not answer. Open Docker Desktop (Start menu), wait until it says 'Engine running', then type this line again."
    }

    # -CleanUp
    if ($CleanUp) {
        if (-not (StateOf $Name)) { return Fail "No container named ${Name}: nothing removed, so that you keep ${Name}-old." }
        if (StateOf "$Name-old") { Run @("rm", "$Name-old"); Say "Removed the old container $Name-old." }
        docker image inspect "${image}:previous" *> $null
        if ($LASTEXITCODE -eq 0) { Run @("rmi", "${image}:previous"); Say "Removed the previous image." }
        Say "Clean."
        return 0
    }

    $state = StateOf $Name

    # -Update
    if ($Update) {
        if (-not $state) { return Fail "No container named ${Name}: type the line without -Update to create it." }
        if (StateOf "$Name-old") { return Fail "$Name-old is still there, from an earlier update: once $Name works, type the line with -CleanUp, then -Update again." }
        $folder = BindSource $Name "/workspace"
        if (-not $folder) { return Fail "$Name has no folder on /workspace: update it by hand ($docs/docs/guides/updating.html#by-hand)." }
        $claudeVolume = BindSource $Name "/home/node/.claude"
        if (-not $claudeVolume -or $claudeVolume -match '[/\\:]') {
            return Fail "$Name keeps Claude Code's state inside itself, not on a volume: update it by hand ($docs/docs/guides/updating.html#without-the-claude-code-volume)."
        }
        $others = @(docker ps -a --filter "volume=$claudeVolume" --format "{{.Names}}" | Where-Object { $_ -and $_ -ne $Name })
        if ($others.Count -gt 0) { return Fail "The volume $claudeVolume is shared with $($others -join ' '): see $docs/docs/guides/updating.html#one-claude-code-volume-per-container." }
        $envLines = @(docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" $Name)
        if (-not $ModelGiven) { $Model = EnvOf $Name "OLLAMA_DEFAULT_MODEL" }
        # The profile the container was created with, carried over as its record: the folder's own
        # profile file wins over it in the container, as it did (D87).
        $recordedProfile = EnvOf $Name "HARNESS_PROFILE"
        if ($gpu -and ("$(docker inspect -f '{{len .HostConfig.DeviceRequests}}' $Name)".Trim() -eq "0")) { $gpu = $false }
        # The variables given at docker run beyond those above: passed on by name when this window
        # has them (a key set on your computer), named otherwise. Never their values.
        $oldImage = "$(docker inspect -f '{{.Image}}' $Name)".Trim()
        $imageEnv = EnvNames @(docker image inspect -f "{{range .Config.Env}}{{println .}}{{end}}" $oldImage 2>$null)
        $known = @("CLAUDE_CONFIG_DIR", "HARNESS_WORKTREE_ROOT", "OLLAMA_DEFAULT_MODEL", "HARNESS_PROFILE", "DOCKER_MODE")
        $extraEnv = @(); $missing = @()
        foreach ($var in (EnvNames $envLines)) {
            if ($known -contains $var -or $imageEnv -contains $var) { continue }
            if (Test-Path "env:$var") { $extraEnv += @("-e", $var) } else { $missing += $var }
        }

        if (-not (PullImage)) { return Fail "The download failed: check your internet connection. Your container is unchanged." }
        if ($state -eq "running") { Say "Stopping $Name..."; Run @("stop", $Name) }
        Run @("tag", $oldImage, "${image}:previous")
        Run @("rename", $Name, "$Name-old")
        CreateVolumes @("$Name-worktrees")
        Say "The old container is kept as $Name-old. When the new one works, type the same line with -CleanUp."
        Say "To go back instead: docker rm -f $Name; docker rename $Name-old $Name; docker tag ${image}:previous $image; docker start -ai $Name"
        if ($missing.Count -gt 0) { Say "Not carried over (not set in this window): $($missing -join ' ') - give a key again with: workshop --secret <NAME>" }
        Say "Starting $Name on the new image, folder $folder..."
        return StartNew $folder $claudeVolume $gpu $Model $recordedProfile $extraEnv
    }

    # An existing container: open it. One line is one named container (D87): -Folder or -Profile given
    # with the name of a container that works elsewhere, or on another profile, is refused - never ignored.
    if ($state) {
        $current = BindSource $Name "/workspace"
        if ($FolderGiven -and $current -and ((NormalFolder $Folder) -ne (NormalFolder $current))) {
            Say "$Name already works on ${current}, not on ${Folder}: one line opens one named container, whatever -Folder says."
            return Refuse "For another folder, give it another name: -Name <other-name> -Folder `"$Folder`" - or remove this container first: docker rm $Name (your folder and the volumes are kept)."
        }
        if ($ProfileGiven) {
            $recorded = EnvOf $Name "HARNESS_PROFILE"
            if (-not $recorded) {
                Say "$Name records no profile: -Profile $HarnessProfile is not checked (in the container, 'workshop-profile' shows the profile in force)."
            } elseif ($HarnessProfile -ne $recorded) {
                Say "$Name was created with the profile ${recorded}, not ${HarnessProfile}: one line opens one named container, whatever -Profile says."
                return Refuse "For another profile, give it another name: -Name <other-name> -Profile $HarnessProfile - or remove this container first: docker rm $Name (your folder and the volumes are kept) - or change it inside: workshop-profile $HarnessProfile."
            }
        }
        if ($state -eq "running") {
            Say "$Name is running: opening a second terminal in it (type 'workshop' to open Claude Code)."
            return HandOver @("exec", "-it", "--user", "node", $Name, "zsh")
        }
        Say "Starting $Name (then type 'workshop' to open Claude Code)..."
        return HandOver @("start", "-ai", $Name)
    }

    # A new container
    if (-not $Folder) {
        $homeDir = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
        $default = Join-Path $homeDir "Orkeon"
        $answer = Read-Host "[workshop] The folder of your workshop, where your teams live [$default] (Enter keeps it)"
        $Folder = if ("$answer".Trim()) { "$answer".Trim().Trim('"') } else { $default }
    }
    $Folder = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Folder)
    if ($Folder.Length -gt 3) { $Folder = $Folder.TrimEnd('\', '/') }

    # The folder the harness accepts (sync-harness.sh is_workshop, D87): missing, empty, a workshop - one
    # that holds teams/ or the harness, or nothing but the ordinary files of a git repository (README*,
    # LICENSE*) next to its .git - whether git versions it or not; or a git checkout to work on, with a
    # profile made for one. The checkout of this repository is told so. Refused here, before a
    # container is created on it.
    $gitHere = Test-Path -LiteralPath (Join-Path $Folder ".git")
    $visible = @()
    if (Test-Path -LiteralPath $Folder) {
        $visible = @(Get-ChildItem -LiteralPath $Folder -Force | Where-Object {
            $_.Name -notmatch '^\.' -and @("desktop.ini", "Thumbs.db", "lost+found") -notcontains $_.Name -and
            -not ($gitHere -and $_.Name -match '^(?i)(readme|licen[cs]e)') } | ForEach-Object { $_.Name })
    }
    $workshop = (Test-Path -LiteralPath (Join-Path $Folder "teams") -PathType Container) -or
                (Test-Path -LiteralPath (Join-Path (Join-Path $Folder ".claude") ".harness-manifest")) -or
                $visible.Count -eq 0
    $held = ($visible | Select-Object -First 3) -join ' '
    if ($gitHere -and $HarnessProfile -eq "user" -and (IsThisRepository $Folder)) {
        return Fail "$Folder is a git checkout: give it a profile made for one, for instance -Profile dev (or release, docs, contrib)."
    } elseif ($workshop) {
    } elseif ($gitHere -and $HarnessProfile -ne "user") {
    } elseif ($gitHere) {
        return Fail "$Folder holds other files ($held...): choose an empty folder, or the folder that holds your teams. A git checkout you work on takes a profile made for one: -Profile dev (or release, docs, contrib)."
    } else {
        return Fail "$Folder holds other files ($held...): choose an empty folder, or the folder that holds your teams."
    }
    if (-not (Test-Path -LiteralPath $Folder)) {
        Say "Creating the folder $Folder"
        if ($DryRun) { Write-Host "+ New-Item -ItemType Directory $Folder" } else { New-Item -ItemType Directory -Force -Path $Folder | Out-Null }
    }

    docker image inspect $image *> $null
    if ($LASTEXITCODE -ne 0) {
        if ($env:LOCALAPPDATA) {
            $drive = Get-PSDrive -Name $env:LOCALAPPDATA.Substring(0, 1) -ErrorAction Ignore
            if ($drive -and $drive.Free -lt 30GB) { Say ("Warning: {0} GB free on {1}:, about 25 GB are needed." -f [int]($drive.Free / 1GB), $drive.Name) }
        }
        if (-not (PullImage)) { return Fail "The download failed: check your internet connection, then type this line again." }
    }

    if ($gpu) {
        docker image inspect $image *> $null
        if ($DryRun -and $LASTEXITCODE -ne 0) {
            Say "(dry run: the image is not there, the GPU is not tried)"
        } else {
            docker run --rm --gpus=all --entrypoint true $image *> $null
            if ($LASTEXITCODE -eq 0) { Say "NVIDIA GPU found: the local models will use it." }
            else { $gpu = $false; Say "No usable NVIDIA GPU: the local models will run on the processor, more slowly." }
        }
    }

    $claudeVolume = "$Name-claude"
    CreateVolumes @($claudeVolume, "$Name-worktrees")
    Say "Creating $Name on $Folder (profile $HarnessProfile). The first start takes a minute or two."
    return StartNew $Folder $claudeVolume $gpu $Model $HarnessProfile @()
}

$modelGiven = $PSBoundParameters.ContainsKey("Model") -or $NoModel
$workshopModel = if ($NoModel) { "" } else { $Model }
$workshopState = @{ HandOver = $null }
$folderGiven = $PSBoundParameters.ContainsKey("Folder") -and [bool]$Folder
$profileGiven = $PSBoundParameters.ContainsKey("HarnessProfile")     # -Profile is its alias
$workshopResult = Invoke-OrkeonWorkshop -Folder $Folder -FolderGiven $folderGiven -Name $Name -HarnessProfile $HarnessProfile `
    -ProfileGiven $profileGiven -Model $workshopModel -ModelGiven $modelGiven -NoGpu $NoGpu.IsPresent -Update $Update.IsPresent `
    -CleanUp $CleanUp.IsPresent -DryRun $DryRun.IsPresent -Outcome $workshopState
$workshopCode = [int](@($workshopResult)[-1])
if ($workshopCode -eq 0 -and $workshopState.HandOver) {
    if ($DryRun) {
        Write-Host ("+ docker " + ($workshopState.HandOver -join " "))
    } elseif (Get-Command docker -CommandType Function -ErrorAction Ignore) {
        $workshopCommand = $workshopState.HandOver      # a docker function: the fake of the tests
        docker @workshopCommand
        $workshopCode = $LASTEXITCODE
    } else {
        # Start-Process hands docker this window's console as it is, however the script was started
        # (irm | iex, a script block, -File), so that the container's terminal is a real one.
        # PowerShell 5.1 joins -ArgumentList unquoted: a folder with a space is quoted here.
        $workshopLine = ($workshopState.HandOver | ForEach-Object {
            if ($_ -match '[\s"]') { '"' + (($_ -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"' } else { $_ }
        }) -join " "
        $workshopProcess = Start-Process -FilePath "docker" -ArgumentList $workshopLine -NoNewWindow -Wait -PassThru
        $workshopCode = $workshopProcess.ExitCode
    }
}
$global:LASTEXITCODE = $workshopCode
