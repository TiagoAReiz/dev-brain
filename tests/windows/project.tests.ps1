. "$PSScriptRoot\helpers.ps1"

$global:PjRepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path

function New-PjTree {
    # monta <perfil>\dev-brain com windows\, lib\, templates\ e stubs de gh/claude; WORKFOLDER = <perfil>\wf
    $p = New-FakeProfile
    $home1 = Join-Path $p 'dev-brain'
    New-Item -ItemType Directory -Path (Join-Path $home1 'windows') -Force | Out-Null
    foreach ($f in 'lib.ps1', 'new-project.ps1', 'project.ps1') {
        Copy-Item "$global:PjRepoRoot\windows\$f" (Join-Path $home1 'windows')
    }
    New-Item -ItemType Directory -Path (Join-Path $home1 'lib') -Force | Out-Null
    Copy-Item "$global:PjRepoRoot\lib\project-json.cjs" (Join-Path $home1 'lib')
    Copy-Item "$global:PjRepoRoot\templates" $home1 -Recurse

    $global:PjEnvOrig = @{}
    foreach ($k in 'WORKFOLDER', 'DEVBRAIN_CLAUDE', 'STUB_LOG', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL') {
        $global:PjEnvOrig[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
    }
    $wf = Join-Path $p 'wf'
    New-Item -ItemType Directory -Path $wf -Force | Out-Null
    $env:WORKFOLDER = $wf
    $env:STUB_LOG = Join-Path $p 'stub.log'
    $env:DEVBRAIN_CLAUDE = 'claude-stub'
    $env:GIT_AUTHOR_NAME = 'Teste'; $env:GIT_AUTHOR_EMAIL = 'teste@example.com'
    $env:GIT_COMMITTER_NAME = 'Teste'; $env:GIT_COMMITTER_EMAIL = 'teste@example.com'

    $bin = Join-Path $p 'bin'
    New-FakeBin $bin 'gh' @'
@echo off
echo gh %* >> "%STUB_LOG%"
if "%1"=="repo" if "%2"=="list" (echo owner/alpha& echo owner/Beta)
if "%1"=="repo" if "%2"=="clone" mkdir %4
exit /b 0
'@
    New-FakeBin $bin 'claude-stub' @'
@echo off
echo claude %* >> "%STUB_LOG%"
cd >> "%STUB_LOG%"
exit /b 0
'@
    return $home1
}

function Remove-PjTree {
    foreach ($k in $global:PjEnvOrig.Keys) {
        if ($null -eq $global:PjEnvOrig[$k]) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
        else { Set-Item "Env:$k" $global:PjEnvOrig[$k] }
    }
    Remove-FakeProfile
}

function Invoke-Pj {
    param([string]$DevHome, [string[]]$PjArgs, [string]$InputText = $null)
    $script = Join-Path $DevHome 'windows\project.ps1'
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location (Split-Path -Parent $DevHome)
    try {
        if ($null -ne $InputText) {
            $out = @($InputText | & powershell -NoProfile -ExecutionPolicy Bypass -File $script @PjArgs 2>&1 | ForEach-Object { "$_" })
        } else {
            $out = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $script @PjArgs 2>&1 | ForEach-Object { "$_" })
        }
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $old
    }
    return [pscustomobject]@{ Code = $code; Out = ($out -join "`n") }
}

function Get-StubLog {
    if (Test-Path -LiteralPath $env:STUB_LOG) { return [System.IO.File]::ReadAllText($env:STUB_LOG) }
    return ''
}

function Invoke-GitQuiet {
    param([string[]]$GitArgs)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & git @GitArgs 2>&1 | Out-Null
    $ErrorActionPreference = $old
}

function New-PjRepo([string]$Dir) {
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
    Invoke-GitQuiet @('-C', $Dir, 'init', '-q', '-b', 'main')
}

Describe 'project.ps1' {
    It '--json repassa para o Node e devolve só o JSON' {
        $h = New-PjTree
        try {
            New-Item -ItemType Directory -Path (Join-Path $env:WORKFOLDER 'alpha') -Force | Out-Null
            $r = Invoke-Pj $h @('resumo', '--json')
            $r.Code | Should Be 0
            $r.Out.Trim().StartsWith('{') | Should Be $true
            $j = $r.Out | ConvertFrom-Json
            @($j.repos).Count | Should Be 1
            $j.repos[0].nome | Should Be 'alpha'
            $j.memoria.semRepo | Should Be $true
        } finally { Remove-PjTree }
    }

    It 'sem argumento imprime a ajuda' {
        $h = New-PjTree
        try {
            $r = Invoke-Pj $h @()
            $r.Code | Should Be 0
            $r.Out | Should Match 'project create \[nome\] \[--public\|--private\]'
            $r.Out | Should Match 'project start'
            $r.Out | Should Match 'project exit'
        } finally { Remove-PjTree }
    }

    It 'comando desconhecido imprime a ajuda' {
        $h = New-PjTree
        try {
            $r = Invoke-Pj $h @('foo')
            $r.Out | Should Match 'project create'
            $r.Out | Should Match 'project exit'
        } finally { Remove-PjTree }
    }

    It 'create com nome inválido aborta sem criar nada' {
        $h = New-PjTree
        try {
            $r = Invoke-Pj $h @('create', 'Meu_App', '--private')
            $r.Code | Should Be 1
            $r.Out | Should Match "Erro: nome 'Meu_App': use só minúsculas, números e hífens \(ex\.: meu-app\)\."
            Test-Path (Join-Path $env:WORKFOLDER 'Meu_App') | Should Be $false
            Test-Path (Join-Path $env:WORKFOLDER 'meu_app') | Should Be $false
        } finally { Remove-PjTree }
    }

    It 'create com pasta já existente aborta' {
        $h = New-PjTree
        try {
            New-Item -ItemType Directory -Path (Join-Path $env:WORKFOLDER 'meu-app') -Force | Out-Null
            $r = Invoke-Pj $h @('create', 'meu-app', '--private')
            $r.Code | Should Be 1
            $r.Out | Should Match "Erro: nome 'meu-app': '.*meu-app' já existe\."
            $r.Out | Should Not Match 'Criando o projeto'
        } finally { Remove-PjTree }
    }

    It 'create cria pasta, README, CLAUDE.md, chama gh repo create --push e abre o Claude com o kickoff' {
        $h = New-PjTree
        try {
            $r = Invoke-Pj $h @('create', 'meu-app', '--public')
            $r.Code | Should Be 0
            $dir = Join-Path $env:WORKFOLDER 'meu-app'
            ([System.IO.File]::ReadAllText((Join-Path $dir 'README.md'))) | Should Be "# meu-app`n"
            Test-Path (Join-Path $dir 'CLAUDE.md') | Should Be $true
            Test-Path (Join-Path $h 'memory\meu-app\README.md') | Should Be $true
            $log = Get-StubLog
            $log | Should Match 'gh repo create meu-app --public --source=\. --remote=origin --push'
            $log | Should Match 'claude --dangerously-skip-permissions "Use a skill kickoff para preencher a mem'
            $log | Should Match 'meu-app no dev-brain\."'
            $log.Contains($dir) | Should Be $true
            $r.Out | Should Match "Projeto 'meu-app' criado e enviado para o GitHub!"
            $r.Out | Should Match 'memory\\ não é um repo git; memória .meu-app. criada só localmente'
        } finally { Remove-PjTree }
    }

    It 'create sem visibilidade pergunta e usa privado por padrão' {
        $h = New-PjTree
        try {
            $r = Invoke-Pj $h @('create', 'meu-app') "`n"
            $r.Code | Should Be 0
            (Get-StubLog) | Should Match 'gh repo create meu-app --private '
        } finally { Remove-PjTree }
    }

    It 'create com memory\.git commita a memória' {
        $h = New-PjTree
        try {
            $mem = Join-Path $h 'memory'
            New-PjRepo $mem
            $r = Invoke-Pj $h @('create', 'meu-app', '--private')
            $r.Code | Should Be 0
            $old = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            $msg = (& git -C $mem log -1 --format=%s 2>&1 | ForEach-Object { "$_" }) -join ''
            $ErrorActionPreference = $old
            $msg | Should Be 'memory(meu-app): cria projeto'
        } finally { Remove-PjTree }
    }

    It 'exit mantém pasta sem .git, remove só o que o Node confirmou e imprime Atenção' {
        $h = New-PjTree
        try {
            $wf = $env:WORKFOLDER
            New-Item -ItemType Directory -Path (Join-Path $wf 'nogit') -Force | Out-Null
            New-PjRepo (Join-Path $wf 'saved1')
            New-PjRepo (Join-Path $wf 'kept1')
            New-PjRepo (Join-Path $wf 'envproj')
            [System.IO.File]::WriteAllText((Join-Path $wf 'envproj\.gitignore'), ".env`n")
            [System.IO.File]::WriteAllText((Join-Path $wf 'envproj\.env'), "X=1`n")
            [System.IO.File]::WriteAllText((Join-Path $wf 'solto.txt'), 'x')
            New-FakeBin (Join-Path (Split-Path -Parent $h) 'nbin') 'node' @'
@echo off
echo node %4 >> "%STUB_LOG%"
echo %4 | findstr /c:"kept1" >nul
if not errorlevel 1 (
  echo   Mantido: simulado 1>&2
  exit /b 1
)
echo   Projeto salvo e confirmado no origin.
exit /b 0
'@
            $r = Invoke-Pj $h @('exit')
            $r.Code | Should Be 0
            Test-Path (Join-Path $wf 'nogit') | Should Be $true
            Test-Path (Join-Path $wf 'saved1') | Should Be $false
            Test-Path (Join-Path $wf 'kept1') | Should Be $true
            Test-Path (Join-Path $wf 'envproj') | Should Be $true
            Test-Path (Join-Path $wf 'solto.txt') | Should Be $true
            $r.Out | Should Match 'Não é repo git; mantido\.'
            $r.Out | Should Match 'Projeto salvo e confirmado no origin\.'
            $r.Out | Should Match 'Mantido: simulado'
            $r.Out | Should Match 'Arquivos ignorados que NÃO vão para o GitHub'
            $r.Out | Should Match 'Atenção: 3 pasta\(s\) mantida\(s\) no workfolder:'
            $r.Out | Should Match '-> nogit'
            $r.Out | Should Match '-> kept1'
            $r.Out | Should Match '-> envproj'
            $r.Out | Should Match 'memory\\ não é um repo git'
            $log = Get-StubLog
            $log | Should Not Match 'envproj'
        } finally { Remove-PjTree }
    }

    It 'exit com tudo salvo limpa o workfolder' {
        $h = New-PjTree
        try {
            $wf = $env:WORKFOLDER
            New-PjRepo (Join-Path $wf 'saved1')
            New-FakeBin (Join-Path (Split-Path -Parent $h) 'nbin') 'node' "@echo off`r`necho   Projeto salvo e confirmado no origin.`r`nexit /b 0"
            $r = Invoke-Pj $h @('exit')
            $r.Code | Should Be 0
            Test-Path (Join-Path $wf 'saved1') | Should Be $false
            $r.Out | Should Match 'Pronto! Workfolder limpo\.'
        } finally { Remove-PjTree }
    }

    It 'start usa menu numerado sem fzf, clona e abre o Claude' {
        $h = New-PjTree
        try {
            # fzf real no PATH atrapalharia o menu: tira a pasta dele do PATH do teste
            $fzf = Get-Command fzf -ErrorAction SilentlyContinue
            if ($fzf) {
                $dirFzf = (Split-Path -Parent $fzf.Source).TrimEnd('\')
                $env:PATH = (($env:PATH -split ';') | Where-Object { $_ -and $_.TrimEnd('\') -ine $dirFzf }) -join ';'
            }
            $r = Invoke-Pj $h @('start') "2`n"
            $r.Code | Should Be 0
            $r.Out | Should Match '1\) owner/alpha'
            $r.Out | Should Match '2\) owner/Beta'
            $dir = Join-Path $env:WORKFOLDER 'Beta'
            Test-Path $dir | Should Be $true
            $log = Get-StubLog
            $log | Should Match 'gh repo clone owner/Beta .*Beta -- -q'
            $log | Should Match 'claude --dangerously-skip-permissions\s*\r?\n'
            $log.Contains($dir) | Should Be $true
        } finally { Remove-PjTree }
    }

    It 'start pula o pull se o dev-brain tiver mudanças' {
        $h = New-PjTree
        try {
            New-PjRepo $h    # tudo não rastreado = mudanças locais
            $r = Invoke-Pj $h @('start') "1`n"
            $r.Out | Should Match 'dev-brain tem mudanças locais; pulando o pull\.'
        } finally { Remove-PjTree }
    }

    It 'start com seleção inválida aborta' {
        $h = New-PjTree
        try {
            $r = Invoke-Pj $h @('start') "9`n"
            $r.Code | Should Be 1
            $r.Out | Should Match 'Erro: seleção inválida\.'
        } finally { Remove-PjTree }
    }

    It 'start mostra o estado atual da memória' {
        $h = New-PjTree
        try {
            $mem = Join-Path $h 'memory\alpha'
            New-Item -ItemType Directory -Path $mem -Force | Out-Null
            [System.IO.File]::WriteAllText((Join-Path $mem 'estado-atual.md'), "# Estado`n`n## Foco atual`nTerminar a tela X`n")
            $r = Invoke-Pj $h @('start') "1`n"
            $r.Code | Should Be 0
            $r.Out | Should Match 'Estado atual \(dev-brain\):'
            $r.Out | Should Match '  ## Foco atual'
            $r.Out | Should Match '  Terminar a tela X'
        } finally { Remove-PjTree }
    }
}
