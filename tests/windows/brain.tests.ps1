. "$PSScriptRoot\helpers.ps1"

$script:BrainRepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path

function New-BrainHome {
    # monta <perfil>\dev-brain só com windows\ e global\ (sem .git e sem memory\: nada de git real nem pull)
    $p = New-FakeProfile
    $h = Join-Path $p 'dev-brain'
    New-Item -ItemType Directory -Path (Join-Path $h 'windows') -Force | Out-Null
    Copy-Item "$script:BrainRepoRoot\windows\*.ps1" (Join-Path $h 'windows')
    Copy-Item "$script:BrainRepoRoot\global" $h -Recurse
    return $h
}

function Invoke-Brain {
    param([string]$DevHome, [string[]]$BrainArgs = @())
    $script = Join-Path $DevHome 'windows\brain.ps1'
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = (& powershell -NoProfile -ExecutionPolicy Bypass -File $script @BrainArgs 2>&1 | ForEach-Object { "$_" } | Out-String)
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
    return [pscustomobject]@{ Out = $out; Code = $code }
}

function Invoke-GitQuiet {
    param([string]$Folder, [string[]]$GitArgs)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        return @(& git -C $Folder @GitArgs 2>$null | ForEach-Object { "$_" })
    } finally { $ErrorActionPreference = $old }
}

Describe 'brain.ps1' {
    It 'ajuda, help, -h e --help mostram a ajuda e saem 0' {
        $h = New-BrainHome
        try {
            foreach ($a in 'ajuda', 'help', '-h', '--help') {
                $r = Invoke-Brain $h @($a)
                $r.Code | Should Be 0
                $r.Out | Should Match 'brain down'
                $r.Out | Should Match 'brain setup'
            }
        } finally { Remove-FakeProfile }
    }

    It 'comando desconhecido sai 1 com a mensagem e a ajuda' {
        $h = New-BrainHome
        try {
            $r = Invoke-Brain $h @('xyz')
            $r.Code | Should Be 1
            $r.Out | Should Match "brain: comando desconhecido 'xyz'"
            $r.Out | Should Match 'brain down'
        } finally { Remove-FakeProfile }
    }

    It 'sem argumento roda o bootstrap, mostra o status e avisa o Habblaud' {
        $p = New-FakeProfile
        $h = Join-Path $p 'dev-brain'
        try {
            New-Item -ItemType Directory -Path (Join-Path $h 'windows') -Force | Out-Null
            Copy-Item "$script:BrainRepoRoot\windows\*.ps1" (Join-Path $h 'windows')
            Copy-Item "$script:BrainRepoRoot\global" $h -Recurse
            $r = Invoke-Brain $h @()
            $r.Code | Should Be 0
            Test-Path (Join-Path $p '.dev-brain\bin\brain.cmd') | Should Be $true
            $r.Out | Should Match 'Feito \('
            $r.Out | Should Match 'dev-brain: \d+ mudança\(s\) local\(is\), \d+ commit\(s\) sem push'
            $r.Out | Should Match 'Habblaud \(painel visual\) ainda não tem versão nativa no Windows; use o WSL para ele\.'
        } finally { Remove-FakeProfile }
    }

    It 'status mostra as mudanças locais do dev-brain' {
        $h = New-BrainHome
        try {
            Invoke-GitQuiet $h @('init', '-q') | Out-Null
            Invoke-GitQuiet $h @('add', '-A') | Out-Null
            Invoke-GitQuiet $h @('-c', 'user.name=teste', '-c', 'user.email=teste@exemplo.com', 'commit', '-q', '-m', 'base') | Out-Null
            [System.IO.File]::WriteAllText((Join-Path $h 'novo.txt'), 'x', (New-Object System.Text.UTF8Encoding($false)))
            $r = Invoke-Brain $h @('status')
            $r.Code | Should Be 0
            $r.Out | Should Match 'dev-brain: 1 mudança\(s\) local\(is\), 0 commit\(s\) sem push'
            $r.Out | Should Match 'sem memória privada'
        } finally { Remove-FakeProfile }
    }

    It 'down sem repo de memória só informa' {
        $h = New-BrainHome
        try {
            $r = Invoke-Brain $h @('down')
            $r.Code | Should Be 0
            $r.Out | Should Match 'não é um repo git'
        } finally { Remove-FakeProfile }
    }

    It 'down com repo de memória mostra as mudanças e não commita com DEVBRAIN_ASSUME=n' {
        $h = New-BrainHome
        try {
            $mem = Join-Path $h 'memory'
            New-Item -ItemType Directory -Path $mem -Force | Out-Null
            Invoke-GitQuiet $mem @('init', '-q') | Out-Null
            [System.IO.File]::WriteAllText((Join-Path $mem 'nota.md'), 'x', (New-Object System.Text.UTF8Encoding($false)))
            $r = Invoke-Brain $h @('down')
            $r.Code | Should Be 0
            $r.Out | Should Match 'Mudanças em memory'
            @(Invoke-GitQuiet $mem @('log', '--oneline')).Count | Should Be 0
            @(Invoke-GitQuiet $mem @('status', '--short')) -join "`n" | Should Match '\?\? nota\.md'
        } finally { Remove-FakeProfile }
    }

    It 'setup repassa os argumentos para windows\setup.ps1' {
        $h = New-BrainHome
        try {
            $stub = "param([switch]`$DryRun, [switch]`$SemFerramentas)`r`nWrite-Host ('SETUP DRYRUN=' + `$DryRun + ' SEMFERRAMENTAS=' + `$SemFerramentas)`r`n"
            [System.IO.File]::WriteAllText((Join-Path $h 'windows\setup.ps1'), $stub, (New-Object System.Text.UTF8Encoding($false)))
            $r = Invoke-Brain $h @('setup', '-DryRun', '-SemFerramentas')
            $r.Code | Should Be 0
            $r.Out | Should Match 'SETUP DRYRUN=True SEMFERRAMENTAS=True'
        } finally { Remove-FakeProfile }
    }
}
