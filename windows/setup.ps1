param(
    [switch]$DryRun,
    [switch]$SemFerramentas
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"

try {
    $manual = New-Object System.Collections.ArrayList
    $wingetOk = Test-Command 'winget'

    function Step([string]$Text) {
        Write-Host ''
        Write-Host "==> $Text" -ForegroundColor Blue
    }

    function Update-SessionPath {
        $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $u = [Environment]::GetEnvironmentVariable('Path', 'User')
        $env:PATH = (@($m, $u) | Where-Object { $_ }) -join ';'
    }

    function Install-Tool([string]$Cmd, [string]$Id, [bool]$Required) {
        if (Test-Command $Cmd) { Write-Host "  $Cmd já instalado"; return }
        $line = "winget install --id $Id -e --accept-package-agreements --accept-source-agreements"
        if (-not $wingetOk) {
            [void]$manual.Add("instalar $Cmd (sem winget; veja https://aka.ms/winget): $line")
            return
        }
        if ($DryRun) { Write-Info "  [dry-run] $line"; return }
        Write-Info "  instalando $Cmd ($Id)"
        $old = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & winget install --id $Id -e --accept-package-agreements --accept-source-agreements
            $rc = $LASTEXITCODE
        } finally { $ErrorActionPreference = $old }
        if ($rc -ne 0) {
            $tipo = 'opcional'
            if ($Required) { $tipo = 'obrigatório' }
            [void]$manual.Add("instalar $Cmd ($tipo) na mão: $line")
        }
    }

    Step '1/3 Ferramentas'
    if ($SemFerramentas) {
        Write-Host '  pulado (-SemFerramentas)'
    } else {
        Install-Tool 'git'  'Git.Git'            $true
        Install-Tool 'gh'   'GitHub.cli'         $true
        Install-Tool 'node' 'OpenJS.NodeJS.LTS'  $true
        Install-Tool 'fzf'  'junegunn.fzf'       $false

        $claudeCmd = $env:DEVBRAIN_CLAUDE
        if (-not $claudeCmd) { $claudeCmd = 'claude' }
        if (Test-Command $claudeCmd) {
            Write-Host '  Claude Code já instalado'
        } elseif ($DryRun) {
            Write-Info '  [dry-run] irm https://claude.ai/install.ps1 | iex'
        } else {
            Write-Info '  instalando o Claude Code'
            try {
                Invoke-RestMethod 'https://claude.ai/install.ps1' | Invoke-Expression
            } catch {
                [void]$manual.Add('instalar o Claude Code: irm https://claude.ai/install.ps1 | iex')
            }
        }
        if (-not $DryRun) { Update-SessionPath }
    }

    Step '2/3 Links (bootstrap.ps1)'
    if ($DryRun) {
        Write-Info "  [dry-run] powershell -NoProfile -ExecutionPolicy Bypass -File $PSScriptRoot\bootstrap.ps1"
    } else {
        & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\bootstrap.ps1"
        if ($LASTEXITCODE -ne 0) { throw 'o bootstrap.ps1 falhou.' }
    }

    Step '3/3 GitHub e git'
    if (Test-Command 'gh') {
        $old = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try { & gh auth status *> $null; $ghRc = $LASTEXITCODE } finally { $ErrorActionPreference = $old }
        if ($ghRc -eq 0) { Write-Host '  gh já logado' } else { [void]$manual.Add('login no GitHub: gh auth login') }
    } else {
        [void]$manual.Add('login no GitHub: gh auth login (depois de instalar o gh)')
    }
    if (Test-Command 'git') {
        $old = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $nome = (& git config --global user.name 2>$null)
            $mail = (& git config --global user.email 2>$null)
        } finally { $ErrorActionPreference = $old }
        if (-not $nome) { [void]$manual.Add('git config --global user.name "Seu Nome" (e rode o setup.ps1 de novo)') }
        if (-not $mail) { [void]$manual.Add('git config --global user.email "voce@exemplo.com"') }
    } else {
        [void]$manual.Add('git config --global user.name e user.email (depois de instalar o git)')
    }
    [void]$manual.Add("login no Claude Code: rode 'claude' uma vez (abre o navegador)")

    Step 'Pronto'
    Write-Host "  Dia a dia: 'brain' para sincronizar, 'brain down' para salvar a memória, 'project start' para trabalhar num repo."
    if ($DryRun) { Write-Host '  (dry-run: nada foi instalado nem alterado)' }
    if ($manual.Count -gt 0) {
        Write-Host ''
        Write-Host "Ação manual ($($manual.Count))"
        foreach ($m in $manual) { Write-Host "  - $m" }
    }
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
