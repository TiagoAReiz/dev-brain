# Helpers do dev-brain para Windows (PowerShell 5.1). Dot-source: só funções, sem efeito colateral ao carregar.

function Get-DevBrainHome {
    return (Split-Path -Parent $PSScriptRoot).TrimEnd('\')
}

function Get-UserHome {
    return $env:USERPROFILE
}

function Write-Info { param([string]$Text) Write-Host $Text -ForegroundColor Cyan }
function Write-Ok   { param([string]$Text) Write-Host $Text -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host $Text -ForegroundColor Yellow }
function Write-Err  { param([string]$Text) [Console]::Error.WriteLine($Text) }

function Read-YesNo {
    param([string]$Question)
    $assume = $env:DEVBRAIN_ASSUME
    if ($assume) { return ($assume -ceq 'y' -or $assume -ceq 'Y') }
    if ([Console]::IsInputRedirected) { return $false }
    Write-Host "  $Question (y/N): " -NoNewline
    $resp = [Console]::ReadLine()
    return ($resp -ceq 'y' -or $resp -ceq 'Y')
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

function Get-Slug {
    param([string]$Text)
    $s = ([string]$Text).ToLowerInvariant() -replace '[^a-z0-9]+', '-'
    return $s.Trim('-')
}

function ConvertTo-PlainPath {
    param([string]$Path)
    $p = [string]$Path
    if ($p.StartsWith('\??\')) { $p = $p.Substring(4) }
    return $p.TrimEnd('\').ToLowerInvariant()
}

function New-LinkOrCopy {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Dest,
        [Parameter(Mandatory = $true)][ValidateSet('File', 'Dir')][string]$Kind
    )
    $src = $Source.TrimEnd('\')
    $existing = Get-Item -LiteralPath $Dest -Force -ErrorAction SilentlyContinue
    if ($existing) {
        $isLink = [bool]($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
        $target = ''
        if ($isLink -and $existing.Target) { $target = ConvertTo-PlainPath (@($existing.Target)[0]) }
        if ($Kind -eq 'Dir') {
            if ($isLink -and $existing.PSIsContainer -and $target -eq (ConvertTo-PlainPath $src)) {
                return [pscustomobject]@{ Action = 'ok'; Mode = 'junction' }
            }
        } else {
            if ($isLink -and $target -eq (ConvertTo-PlainPath $src)) {
                return [pscustomobject]@{ Action = 'ok'; Mode = 'symlink' }
            }
            if (-not $isLink -and -not $existing.PSIsContainer) {
                $h1 = (Get-FileHash -LiteralPath $Dest -Algorithm SHA256).Hash
                $h2 = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
                if ($h1 -eq $h2) { return [pscustomobject]@{ Action = 'ok'; Mode = 'copy' } }
            }
        }
        $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
        Move-Item -LiteralPath $Dest -Destination ($Dest + '.bak.' + $ts) -Force
        $action = 'replaced'
    } else {
        $action = 'created'
    }

    $parent = Split-Path -Parent $Dest
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    if ($Kind -eq 'Dir') {
        New-Item -ItemType Junction -Path $Dest -Value $src | Out-Null
        $mode = 'junction'
    } else {
        try {
            New-Item -ItemType SymbolicLink -Path $Dest -Value $src -ErrorAction Stop | Out-Null
            $mode = 'symlink'
        } catch {
            Copy-Item -LiteralPath $src -Destination $Dest -Force
            $mode = 'copy'
        }
    }
    return [pscustomobject]@{ Action = $action; Mode = $mode }
}

function Set-UserEnv {
    param([string]$Name, [string]$Value)
    $persist = ($env:DEVBRAIN_NO_PERSIST -ne '1')
    if ($persist) {
        $current = [Environment]::GetEnvironmentVariable($Name, 'User')
    } else {
        $current = [Environment]::GetEnvironmentVariable($Name, 'Process')
    }
    if ($current -ceq $Value) { return $false }
    if ($persist) { [Environment]::SetEnvironmentVariable($Name, $Value, 'User') }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
    return $true
}

function Add-UserPath {
    param([string]$Folder)
    $persist = ($env:DEVBRAIN_NO_PERSIST -ne '1')
    $want = $Folder.TrimEnd('\')
    if ($persist) {
        $current = [string][Environment]::GetEnvironmentVariable('Path', 'User')
    } else {
        $current = [string]$env:PATH
    }
    foreach ($e in ($current -split ';')) {
        if ($e -and $e.TrimEnd('\') -ieq $want) { return $false }
    }
    $new = if ($current) { $current.TrimEnd(';') + ';' + $want } else { $want }
    if ($persist) {
        [Environment]::SetEnvironmentVariable('Path', $new, 'User')
        $inProc = $false
        foreach ($e in (([string]$env:PATH) -split ';')) {
            if ($e -and $e.TrimEnd('\') -ieq $want) { $inProc = $true }
        }
        if (-not $inProc) { $env:PATH = ([string]$env:PATH).TrimEnd(';') + ';' + $want }
    } else {
        $env:PATH = $new
    }
    return $true
}

function Test-MemoryRepo {
    return (Test-Path -LiteralPath (Join-Path (Get-DevBrainHome) 'memory\.git'))
}

function Save-MemoryRepo {
    param([string]$Label = (Get-Date -Format 'yyyy-MM-dd'))
    if (-not (Test-MemoryRepo)) {
        Write-Info 'memory\ não é um repo git (sem memória privada configurada).'
        return
    }
    $mem = Join-Path (Get-DevBrainHome) 'memory'
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $status = @(& git -C $mem status --short 2>&1 | ForEach-Object { "$_" })
        if ($status.Count -gt 0) {
            Write-Host 'Mudanças em memory\:'
            $status | ForEach-Object { Write-Host "  $_" }
            if (Read-YesNo 'Commitar e enviar essas mudanças de memória?') {
                & git -C $mem add -A 2>&1 | Out-Null
                $msgFile = [System.IO.Path]::GetTempFileName()
                try {
                    [System.IO.File]::WriteAllText($msgFile, "memory: sessão de $Label", (New-Object System.Text.UTF8Encoding($false)))
                    & git -C $mem commit -q -F $msgFile 2>&1 | Out-Null
                } finally {
                    Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
                }
            }
        }
        $pending = @(& git -C $mem log '@{u}..' --oneline 2>$null)
        if ($LASTEXITCODE -eq 0 -and $pending.Count -gt 0) {
            & git -C $mem push -q 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-Warn 'Não consegui enviar a memória (push falhou); tente depois.' }
        }
    } finally {
        $ErrorActionPreference = $old
    }
}
