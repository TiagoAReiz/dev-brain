. "$PSScriptRoot\helpers.ps1"
. "$PSScriptRoot\..\..\windows\lib.ps1"

$script:Bootstrap = (Resolve-Path "$PSScriptRoot\..\..\windows\bootstrap.ps1").Path
$script:Root = (Get-DevBrainHome)

function Invoke-Bootstrap {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        return (& powershell -NoProfile -ExecutionPolicy Bypass -File $script:Bootstrap 2>&1 | Out-String)
    } finally { $ErrorActionPreference = $old }
}

function Initialize-StubGh {
    $stubs = Join-Path $env:USERPROFILE 'stubs'
    New-FakeBin $stubs 'gh' '@exit /b 0'
}

Describe 'bootstrap.ps1' {
    It 'cria links, shims e não cria memory\' {
        $p = New-FakeProfile
        try {
            Initialize-StubGh
            $saida = Invoke-Bootstrap
            Test-Path (Join-Path $p '.claude\CLAUDE.md') | Should Be $true
            Test-Path (Join-Path $p '.claude\CLAUDE.maquina.md') | Should Be $true
            foreach ($s in (Get-ChildItem "$script:Root\global\skills" -Directory)) {
                if (Test-Path (Join-Path $s.FullName 'SKILL.md')) {
                    $l = Get-Item -LiteralPath (Join-Path $p ".claude\skills\$($s.Name)") -Force
                    ([bool]($l.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) | Should Be $true
                    Test-Path (Join-Path $l.FullName 'SKILL.md') | Should Be $true
                }
            }
            foreach ($a in (Get-ChildItem "$script:Root\global\agents" -Filter '*.md')) {
                Test-Path (Join-Path $p ".claude\agents\$($a.Name)") | Should Be $true
            }
            foreach ($n in 'brain', 'project', 'spec-check') {
                $f = Join-Path $p ".dev-brain\bin\$n.cmd"
                $bytes = [System.IO.File]::ReadAllBytes($f)
                ($bytes | Where-Object { $_ -gt 127 }).Count | Should Be 0
                $txt = [System.Text.Encoding]::ASCII.GetString($bytes)
                $txt | Should Match "`r`n"
                ($txt -replace "`r`n", '').Contains("`n") | Should Be $false
                $txt.Contains($script:Root) | Should Be $true
            }
            ([System.IO.File]::ReadAllText((Join-Path $p '.dev-brain\bin\brain.cmd'))) | Should Match 'brain\.ps1'
            ([System.IO.File]::ReadAllText((Join-Path $p '.dev-brain\bin\spec-check.cmd'))) | Should Match 'spec-check'
            $saida | Should Match 'Feito \('
            Test-Path (Join-Path $script:Root 'memory') | Should Be $false
        } finally { Remove-FakeProfile; Remove-Item Env:DEV_BRAIN_HOME -ErrorAction SilentlyContinue }
    }

    It '2a execução não faz nada novo e não cria .bak' {
        $p = New-FakeProfile
        try {
            Initialize-StubGh
            Invoke-Bootstrap | Out-Null
            $env:DEV_BRAIN_HOME = $script:Root
            $env:PATH = (Join-Path $p '.dev-brain\bin') + ';' + $env:PATH
            $saida = Invoke-Bootstrap
            $saida | Should Match 'Feito \(0\)'
            @(Get-ChildItem -Path $p -Recurse -Force -Filter '*.bak.*' -ErrorAction SilentlyContinue).Count | Should Be 0
        } finally { Remove-FakeProfile; Remove-Item Env:DEV_BRAIN_HOME -ErrorAction SilentlyContinue }
    }

    It 'move arquivo diferente para .bak e pede revisão' {
        $p = New-FakeProfile
        try {
            Initialize-StubGh
            $dest = Join-Path $p '.claude\CLAUDE.md'
            New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
            [System.IO.File]::WriteAllText($dest, 'outro conteudo', (New-Object System.Text.UTF8Encoding($false)))
            $saida = Invoke-Bootstrap
            $saida | Should Match 'revisar backup'
            $baks = @(Get-ChildItem (Join-Path $p '.claude') -Filter 'CLAUDE.md.bak.*')
            $baks.Count | Should Be 1
            [System.IO.File]::ReadAllText($baks[0].FullName) | Should Be 'outro conteudo'
        } finally { Remove-FakeProfile; Remove-Item Env:DEV_BRAIN_HOME -ErrorAction SilentlyContinue }
    }

    It 'não persiste DEV_BRAIN_HOME no ambiente do usuário com DEVBRAIN_NO_PERSIST=1' {
        $p = New-FakeProfile
        try {
            $antes = [Environment]::GetEnvironmentVariable('DEV_BRAIN_HOME', 'User')
            Invoke-Bootstrap | Out-Null
            [Environment]::GetEnvironmentVariable('DEV_BRAIN_HOME', 'User') | Should Be $antes
        } finally { Remove-FakeProfile; Remove-Item Env:DEV_BRAIN_HOME -ErrorAction SilentlyContinue }
    }
}
