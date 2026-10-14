. "$PSScriptRoot\helpers.ps1"

$global:PnRepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path

function Invoke-PnGit {
    # git escreve avisos no stderr; sem isso o Pester (Stop) os trata como erro
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { Invoke-PnGit @args } finally { $ErrorActionPreference = $old }
}

function New-PnRepo {
    # repo git em <perfil>\wf\proj, tudo commitado, com origin bare local (file://) já publicado
    param([string]$Profile)
    $wf = Join-Path $Profile 'wf'
    New-Item -ItemType Directory -Path $wf -Force | Out-Null
    $proj = Join-Path $wf 'proj'
    $bare = Join-Path $Profile 'origin.git'
    New-Item -ItemType Directory -Path $proj -Force | Out-Null
    Invoke-PnGit init -q --bare $bare
    Invoke-PnGit -C $proj init -q -b main
    Invoke-PnGit -C $proj config core.autocrlf false
    Invoke-PnGit -C $proj config user.name 'Teste'
    Invoke-PnGit -C $proj config user.email 'teste@example.com'
    [System.IO.File]::WriteAllText((Join-Path $proj 'a.txt'), "oi`n", (New-Object System.Text.UTF8Encoding($false)))
    Invoke-PnGit -C $proj add -A
    Invoke-PnGit -C $proj commit -q -m inicial
    $url = 'file:///' + ($bare -replace '\\', '/')
    Invoke-PnGit -C $proj remote add origin $url
    Invoke-PnGit -C $proj push -q -u origin main
    return $proj
}

function Invoke-PnNode {
    # roda o node.exe real com um script .js; devolve stdout (JSON)
    param([string]$Profile, [string]$Body)
    $js = Join-Path $Profile 'pn.js'
    $lib = ($global:PnRepoRoot + '\lib\project-json.cjs') -replace '\\', '/'
    $code = "const lib = require('$lib');`n" + $Body
    [System.IO.File]::WriteAllText($js, $code, (New-Object System.Text.UTF8Encoding($false)))
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = & node $js 2>&1 | Out-String } finally { $ErrorActionPreference = $old }
    return $out.Trim()
}

Describe 'project-json.cjs com o Node real do Windows' {
    BeforeEach {
        $script:p = New-FakeProfile
        $script:envOrig = @{}
        foreach ($k in 'WORKFOLDER', 'HOME') { $script:envOrig[$k] = [Environment]::GetEnvironmentVariable($k, 'Process') }
        $env:WORKFOLDER = Join-Path $script:p 'wf'
        Remove-Item Env:HOME -ErrorAction SilentlyContinue
    }
    AfterEach {
        foreach ($k in $script:envOrig.Keys) {
            if ($null -eq $script:envOrig[$k]) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
            else { Set-Item "Env:$k" $script:envOrig[$k] }
        }
        Remove-FakeProfile
    }

    It 'carrega sem HOME e sem WORKFOLDER (usa USERPROFILE)' {
        Remove-Item Env:WORKFOLDER -ErrorAction SilentlyContinue
        $out = Invoke-PnNode $script:p "console.log(lib.homeDir() === process.env.USERPROFILE);"
        $out | Should Be 'true'
    }

    It 'inspect nao acusa checkout nao corresponde a pasta' {
        $proj = New-PnRepo $script:p
        $out = Invoke-PnNode $script:p ("const r = lib.inspect(" + (ConvertTo-Json $proj) + "); console.log(JSON.stringify(r.riscos));")
        ($out -like '*checkout não corresponde*') | Should Be $false
        $out | Should Be '[]'
    }

    It 'saveRepo confirma o salvamento num repo com origin local e tudo commitado' {
        $proj = New-PnRepo $script:p
        $out = Invoke-PnNode $script:p ("lib.saveRepo(" + (ConvertTo-Json $proj) + "); console.log('salvo');")
        $out | Should Be 'salvo'
    }
}
