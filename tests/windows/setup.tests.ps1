. "$PSScriptRoot\helpers.ps1"
. "$PSScriptRoot\..\..\windows\lib.ps1"

$script:Root = (Get-DevBrainHome)
$script:Setup = (Resolve-Path "$PSScriptRoot\..\..\windows\setup.ps1").Path
$script:Install = (Resolve-Path "$PSScriptRoot\..\..\install.ps1").Path

function Invoke-Child {
    param([string]$Script, [string[]]$Arguments)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments 2>&1 | Out-String
        return [pscustomobject]@{ Out = $out; Code = $LASTEXITCODE }
    } finally { $ErrorActionPreference = $old }
}

# PATH enxuto: só o Windows e o PowerShell, para git/gh/node/fzf/claude "faltarem".
function Set-MinimalPath([string]$Stubs) {
    $sys = Join-Path $env:SystemRoot 'System32'
    $env:PATH = "$Stubs;$sys;$sys\WindowsPowerShell\v1.0"
}

function Invoke-Git {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & git -c user.name=t -c user.email=t@t @args 2>&1 | Out-Null } finally { $ErrorActionPreference = $old }
}

Describe 'setup.ps1' {
    It '-DryRun lista winget e instalador do Claude e não instala nada' {
        $p = New-FakeProfile
        try {
            $stubs = Join-Path $p 'stubs'
            New-FakeBin $stubs 'winget' '@echo called>"%USERPROFILE%\winget.called"'
            Set-MinimalPath $stubs
            $r = Invoke-Child $script:Setup @('-DryRun')
            $r.Code | Should Be 0
            $r.Out | Should Match 'winget install --id Git\.Git -e --accept-package-agreements --accept-source-agreements'
            $r.Out | Should Match 'winget install --id GitHub\.cli -e'
            $r.Out | Should Match 'winget install --id OpenJS\.NodeJS\.LTS -e'
            $r.Out | Should Match 'winget install --id junegunn\.fzf -e'
            $r.Out | Should Match 'irm https://claude\.ai/install\.ps1 \| iex'
            $r.Out | Should Match 'gh auth login'
            Test-Path (Join-Path $p 'winget.called') | Should Be $false
            Test-Path (Join-Path $p '.claude') | Should Be $false
        } finally { Remove-FakeProfile }
    }

    It 'sem winget vira ação manual' {
        $p = New-FakeProfile
        try {
            $stubs = Join-Path $p 'stubs'
            New-Item -ItemType Directory -Path $stubs -Force | Out-Null
            Set-MinimalPath $stubs
            $r = Invoke-Child $script:Setup @('-DryRun')
            $r.Code | Should Be 0
            $r.Out | Should Match 'sem winget'
            $r.Out | Should Match 'Ação manual'
        } finally { Remove-FakeProfile }
    }

    It '-SemFerramentas pula a instalação' {
        $p = New-FakeProfile
        try {
            $stubs = Join-Path $p 'stubs'
            New-FakeBin $stubs 'winget' '@echo called>"%USERPROFILE%\winget.called"'
            Set-MinimalPath $stubs
            $r = Invoke-Child $script:Setup @('-DryRun', '-SemFerramentas')
            $r.Code | Should Be 0
            $r.Out | Should Match 'pulado'
            $r.Out | Should Not Match 'winget install'
        } finally { Remove-FakeProfile }
    }
}

Describe 'install.ps1' {
    It 'é ASCII puro e sem BOM' {
        $bytes = [System.IO.File]::ReadAllBytes($script:Install)
        ($bytes | Where-Object { $_ -gt 127 }).Count | Should Be 0
        ($bytes[0] -eq 0xEF) | Should Be $false
    }

    It '-DryRun imprime clone e setup sem executar' {
        $p = New-FakeProfile
        try {
            $dir = Join-Path $p 'meu-brain'
            $r = Invoke-Child $script:Install @('-Dir', $dir, '-DryRun')
            $r.Code | Should Be 0
            $r.Out | Should Match 'git clone https://github\.com/TiagoAReiz/dev-brain\.git'
            $r.Out | Should Match 'windows\\setup\.ps1'
            Test-Path $dir | Should Be $false
        } finally { Remove-FakeProfile }
    }

    It 'com clone existente faz pull --ff-only e chama o setup em dry-run' {
        $p = New-FakeProfile
        try {
            $src = Join-Path $p 'src'
            New-Item -ItemType Directory -Path "$src\windows" -Force | Out-Null
            Copy-Item $script:Setup "$src\windows\setup.ps1"
            Copy-Item (Join-Path $script:Root 'windows\lib.ps1') "$src\windows\lib.ps1"
            Invoke-Git -C $src init -q
            Invoke-Git -C $src add -A
            Invoke-Git -C $src commit -q -m inicial
            $dir = Join-Path $p 'clone'
            $url = 'file:///' + ($src -replace '\\', '/')
            Invoke-Git clone -q $url $dir
            [System.IO.File]::WriteAllText("$src\novo.txt", 'x')
            Invoke-Git -C $src add -A
            Invoke-Git -C $src commit -q -m segundo
            $r = Invoke-Child $script:Install @('-Dir', $dir, '-SetupDryRun')
            $r.Code | Should Be 0
            Test-Path "$dir\novo.txt" | Should Be $true
            $r.Out | Should Match 'dry-run'
            $r.Out | Should Match 'Pronto\. Abra um novo terminal e rode: claude'
        } finally { Remove-FakeProfile }
    }

    It 'sobrevive a Get-Content -Raw | Invoke-Expression em dry-run' {
        $p = New-FakeProfile
        try {
            $dir = Join-Path $p 'via-iex'
            $cmd = "`$raw = Get-Content -LiteralPath '$($script:Install)' -Raw; Invoke-Expression ('& { ' + `$raw + ' } -DryRun -Dir ''$dir'''); 'FIM-OK'"
            $old = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try { $out = & powershell -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1 | Out-String } finally { $ErrorActionPreference = $old }
            $out | Should Match 'FIM-OK'
            $out | Should Match 'dry-run'
            Test-Path $dir | Should Be $false
        } finally { Remove-FakeProfile }
    }
}
