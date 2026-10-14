$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"

try {
    $home_ = Get-DevBrainHome
    $userHome = Get-UserHome
    $claudeDir = Join-Path $userHome '.claude'
    $envHome = $env:DEV_BRAIN_HOME
    $done = New-Object System.Collections.ArrayList
    $skipped = New-Object System.Collections.ArrayList
    $manual = New-Object System.Collections.ArrayList

    function Short([string]$p) {
        if ($p.StartsWith($userHome, [System.StringComparison]::OrdinalIgnoreCase)) { return '~' + $p.Substring($userHome.Length) }
        return $p
    }

    Write-Host "SO: windows | DEV_BRAIN_HOME: $home_"

    # --- Dependências (só verifica) ---
    function Check-Cmd([string]$Name, [string]$Req, [string]$Hint) {
        if (Test-Command $Name) { [void]$skipped.Add("$Name já instalado") }
        elseif ($Req -eq 'obrigatório') { [void]$manual.Add("instalar $Name (obrigatório): $Hint") }
        else { [void]$manual.Add("instalar $Name (opcional): $Hint") }
    }
    Check-Cmd 'git'    'obrigatório' 'winget install --id Git.Git -e'
    Check-Cmd 'gh'     'obrigatório' 'winget install --id GitHub.cli -e'
    Check-Cmd 'node'   'opcional'    'winget install --id OpenJS.NodeJS.LTS -e'
    Check-Cmd 'fzf'    'opcional'    'winget install --id junegunn.fzf -e (seletor do project start)'
    Check-Cmd 'claude' 'opcional'    'https://docs.claude.com/claude-code'

    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if (Test-Command 'gh') {
            & gh auth status *> $null
            if ($LASTEXITCODE -ne 0) { [void]$manual.Add('login no GitHub: gh auth login') }
        }
        if (Test-Command 'git') {
            $n = & git config --global user.name 2>$null
            if (-not $n) { [void]$manual.Add('git config --global user.name "Seu Nome"') }
            $e = & git config --global user.email 2>$null
            if (-not $e) { [void]$manual.Add('git config --global user.email "voce@exemplo.com"') }
        }
    } finally {
        $ErrorActionPreference = $old
    }

    # --- Links ---
    function Link([string]$Src, [string]$Dst, [string]$Kind) {
        $r = New-LinkOrCopy -Source $Src -Dest $Dst -Kind $Kind
        if ($r.Action -eq 'ok') {
            [void]$skipped.Add("link ok: $(Short $Dst)")
            return
        }
        if ($r.Action -eq 'replaced') {
            $bak = (Get-ChildItem -LiteralPath (Split-Path -Parent $Dst) -Force |
                Where-Object { $_.Name -like ((Split-Path -Leaf $Dst) + '.bak.*') } |
                Sort-Object Name | Select-Object -Last 1).FullName
            [void]$manual.Add("revisar backup: $(Short $bak) (havia outro arquivo/link no destino)")
        }
        $what = if ($r.Mode -eq 'copy') { 'cópia criada' } else { 'link criado' }
        [void]$done.Add("${what}: $(Short $Dst) -> $(Short $Src)")
    }

    Link (Join-Path $home_ 'global\CLAUDE.md') (Join-Path $claudeDir 'CLAUDE.md') 'File'

    $skillsDir = Join-Path $home_ 'global\skills'
    if (Test-Path -LiteralPath $skillsDir) {
        foreach ($s in (Get-ChildItem -LiteralPath $skillsDir -Directory)) {
            if (-not (Test-Path -LiteralPath (Join-Path $s.FullName 'SKILL.md'))) { continue }
            Link $s.FullName (Join-Path $claudeDir "skills\$($s.Name)") 'Dir'
        }
    }
    $agentsDir = Join-Path $home_ 'global\agents'
    if (Test-Path -LiteralPath $agentsDir) {
        foreach ($a in (Get-ChildItem -LiteralPath $agentsDir -Filter '*.md' -File)) {
            Link $a.FullName (Join-Path $claudeDir "agents\$($a.Name)") 'File'
        }
    }

    # Instruções só desta máquina: criado uma vez, nunca sobrescrito.
    $maquina = Join-Path $claudeDir 'CLAUDE.maquina.md'
    if (Test-Path -LiteralPath $maquina) {
        [void]$skipped.Add("já existe: $(Short $maquina)")
    } else {
        if (-not (Test-Path -LiteralPath $claudeDir)) { New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null }
        [System.IO.File]::WriteAllText($maquina, "<!-- Instruções que só valem nesta máquina (fora do git). Ex.: @RTK.md -->`n", (New-Object System.Text.UTF8Encoding($false)))
        [void]$done.Add("criado: $(Short $maquina) (mova para cá o que era só desta máquina)")
    }

    # --- Shims ---
    $binDir = Join-Path $userHome '.dev-brain\bin'
    $shims = [ordered]@{
        'brain.cmd'      = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$home_\windows\brain.ps1`" %*"
        'project.cmd'    = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$home_\windows\project.ps1`" %*"
        'spec-check.cmd' = "node `"$home_\bin\spec-check`" %*"
    }
    foreach ($name in $shims.Keys) {
        $path = Join-Path $binDir $name
        $text = "@echo off`r`n" + $shims[$name] + "`r`n"
        $cur = $null
        if (Test-Path -LiteralPath $path) { $cur = [System.IO.File]::ReadAllText($path) }
        if ($cur -ceq $text) {
            [void]$skipped.Add("atalho ok: $(Short $path)")
        } else {
            if (-not (Test-Path -LiteralPath $binDir)) { New-Item -ItemType Directory -Path $binDir -Force | Out-Null }
            [System.IO.File]::WriteAllText($path, $text, [System.Text.Encoding]::ASCII)
            [void]$done.Add("atalho criado: $(Short $path)")
        }
    }

    # --- PATH e DEV_BRAIN_HOME ---
    $novoTerminal = $false
    if (Add-UserPath $binDir) {
        [void]$done.Add("PATH do usuário: adicionado $(Short $binDir)")
        $novoTerminal = $true
    } else {
        [void]$skipped.Add("PATH já tem $(Short $binDir)")
    }
    if ($envHome -and $envHome -cne $home_) {
        Write-Warn "Aviso: DEV_BRAIN_HOME=$envHome, mas o repo está em $home_"
    }
    if (Set-UserEnv 'DEV_BRAIN_HOME' $home_) {
        [void]$done.Add("DEV_BRAIN_HOME definida: $home_")
        $novoTerminal = $true
    } else {
        [void]$skipped.Add('DEV_BRAIN_HOME já definida')
    }
    if ($novoTerminal) { [void]$manual.Add('abrir um novo terminal para o PATH e o DEV_BRAIN_HOME valerem') }

    # --- Resumo ---
    function Print-List([string]$Title, $Items) {
        Write-Host ''
        Write-Host "$Title ($($Items.Count))"
        if ($Items.Count -eq 0) { Write-Host '  (nada)'; return }
        foreach ($i in $Items) { Write-Host "  - $i" }
    }
    Print-List 'Feito' $done
    Print-List 'Pulado' $skipped
    Print-List 'Ação manual' $manual
    Write-Host ''
    Write-Host 'Credenciais: veja a seção "O que não é automatizado" no README.'
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
