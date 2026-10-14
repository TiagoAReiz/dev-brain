. "$PSScriptRoot\helpers.ps1"

$global:NpRepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path

function New-NpTree {
    # monta <perfil>\dev-brain com windows\, templates\ e (opcional) memory\
    $p = New-FakeProfile
    $home1 = Join-Path $p 'dev-brain'
    New-Item -ItemType Directory -Path (Join-Path $home1 'windows') -Force | Out-Null
    Copy-Item "$global:NpRepoRoot\windows\lib.ps1" (Join-Path $home1 'windows')
    Copy-Item "$global:NpRepoRoot\windows\new-project.ps1" (Join-Path $home1 'windows')
    Copy-Item "$global:NpRepoRoot\templates" $home1 -Recurse
    $proj = Join-Path $p 'meu-proj'
    New-Item -ItemType Directory -Path $proj -Force | Out-Null
    return $home1
}

function Invoke-Np {
    param([string]$DevHome, [string[]]$NpArgs, [string]$WorkDir)
    $script = Join-Path $DevHome 'windows\new-project.ps1'
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $WorkDir
    try {
        $out = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $script @NpArgs 2>&1 | ForEach-Object { "$_" })
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $old
    }
    return [pscustomobject]@{ Code = $code; Out = ($out -join "`n") }
}

function Get-FirstBytes([string]$Path) {
    $b = [System.IO.File]::ReadAllBytes($Path)
    return $b
}

Describe 'new-project.ps1' {
    It 'cria memória com os 5 templates renderizados, specs\.gitkeep e CLAUDE.md' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            $r = Invoke-Np $h @('meu-app', $proj) $h
            $r.Code | Should Be 0
            $mem = Join-Path $h 'memory\meu-app'
            foreach ($f in 'README.md', 'arquitetura.md', 'decisoes.md', 'estado-atual.md', 'roadmap.md') {
                Test-Path (Join-Path $mem $f) | Should Be $true
            }
            Test-Path (Join-Path $mem 'specs\.gitkeep') | Should Be $true
            Test-Path (Join-Path $proj 'CLAUDE.md') | Should Be $true
            $hoje = Get-Date -Format 'yyyy-MM-dd'
            $todos = @(Get-ChildItem $mem -Filter *.md) + @(Get-Item (Join-Path $proj 'CLAUDE.md'))
            foreach ($f in $todos) {
                $t = [System.IO.File]::ReadAllText($f.FullName)
                $t | Should Not Match '\{\{NOME\}\}'
                $t | Should Not Match '\{\{DATA\}\}'
                $t.Contains("`r") | Should Be $false
                $b = Get-FirstBytes $f.FullName
                ($b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) | Should Be $false
            }
            ([System.IO.File]::ReadAllText((Join-Path $proj 'CLAUDE.md'))) | Should Match 'meu-app'
            $r.Out | Should Match 'Projeto "meu-app" criado.'
        } finally { Remove-FakeProfile }
    }

    It 'sem memory\README.md cria o índice e acrescenta a linha do projeto' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            $r = Invoke-Np $h @('meu-app', $proj) $h
            $r.Code | Should Be 0
            $idx = [System.IO.File]::ReadAllText((Join-Path $h 'memory\README.md'))
            $idx | Should Be "# Memory`n`n- [meu-app](meu-app/README.md): _descreva em 1 linha_`n"
        } finally { Remove-FakeProfile }
    }

    It 'usa a pasta atual quando o caminho é omitido' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            $r = Invoke-Np $h @('meu-app') $proj
            $r.Code | Should Be 0
            Test-Path (Join-Path $proj 'CLAUDE.md') | Should Be $true
        } finally { Remove-FakeProfile }
    }

    It 'nome inválido aborta sem criar nada' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            $r = Invoke-Np $h @('Meu_App', $proj) $h
            $r.Code | Should Be 1
            $r.Out | Should Match "Erro: nome inválido 'Meu_App': use só minúsculas, números e hífens \(ex\.: meu-app\)\."
            Test-Path (Join-Path $h 'memory') | Should Be $false
            Test-Path (Join-Path $proj 'CLAUDE.md') | Should Be $false
        } finally { Remove-FakeProfile }
    }

    It 'memória já existente aborta sem alterar' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            New-Item -ItemType Directory -Path (Join-Path $h 'memory\meu-app') -Force | Out-Null
            $r = Invoke-Np $h @('meu-app', $proj) $h
            $r.Code | Should Be 1
            $r.Out | Should Match 'Erro: já existe: .*meu-app \(nada foi alterado\)'
            Test-Path (Join-Path $proj 'CLAUDE.md') | Should Be $false
            Test-Path (Join-Path $h 'memory\README.md') | Should Be $false
        } finally { Remove-FakeProfile }
    }

    It 'CLAUDE.md já existente aborta sem criar memória' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            [System.IO.File]::WriteAllText((Join-Path $proj 'CLAUDE.md'), 'meu', (New-Object System.Text.UTF8Encoding($false)))
            $r = Invoke-Np $h @('meu-app', $proj) $h
            $r.Code | Should Be 1
            $r.Out | Should Match 'Erro: já existe: .*CLAUDE\.md \(nada foi alterado\)'
            Test-Path (Join-Path $h 'memory\meu-app') | Should Be $false
            [System.IO.File]::ReadAllText((Join-Path $proj 'CLAUDE.md')) | Should Be 'meu'
        } finally { Remove-FakeProfile }
    }

    It 'caminho igual ao dev-brain aborta' {
        $h = New-NpTree
        try {
            $r = Invoke-Np $h @('meu-app', $h) $h
            $r.Code | Should Be 1
            $r.Out | Should Match 'Erro: o caminho do projeto é o próprio dev-brain'
            Test-Path (Join-Path $h 'memory') | Should Be $false
        } finally { Remove-FakeProfile }
    }

    It 'diretório inexistente aborta' {
        $h = New-NpTree
        try {
            $r = Invoke-Np $h @('meu-app', (Join-Path $h 'nao-existe')) $h
            $r.Code | Should Be 1
            $r.Out | Should Match 'Erro: diretório do projeto não existe: '
        } finally { Remove-FakeProfile }
    }

    It 'falha no meio desfaz o que foi criado' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            # um "template" que é diretório faz a leitura falhar depois dos outros
            New-Item -ItemType Directory -Path (Join-Path $h 'templates\memory\zz.md.tpl') -Force | Out-Null
            $r = Invoke-Np $h @('meu-app', $proj) $h
            $r.Code | Should Be 1
            $r.Out | Should Match 'Erro:'
            Test-Path (Join-Path $h 'memory\meu-app') | Should Be $false
            Test-Path (Join-Path $proj 'CLAUDE.md') | Should Be $false
        } finally { Remove-FakeProfile }
    }

    It 'sem memory\.git avisa que a memória ficou só local' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            $r = Invoke-Np $h @('meu-app', $proj) $h
            $r.Code | Should Be 0
            $r.Out | Should Match 'Aviso: memory\\ não é um repo git; a memória ficou só local'
            $r.Out | Should Match 'Próximo: preencha memory/meu-app/README.md'
        } finally { Remove-FakeProfile }
    }

    It 'com memory\.git faz git add e avisa' {
        $h = New-NpTree
        try {
            $proj = Join-Path (Split-Path -Parent $h) 'meu-proj'
            $mem = Join-Path $h 'memory'
            New-Item -ItemType Directory -Path $mem -Force | Out-Null
            $old = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            & git -C $mem init -q 2>&1 | Out-Null
            $ErrorActionPreference = $old
            $r = Invoke-Np $h @('meu-app', $proj) $h
            $r.Code | Should Be 0
            $r.Out | Should Match 'Staged no repo de memória \(sem commit\):'
            $ErrorActionPreference = 'Continue'
            $st = (& git -C $mem status --short 2>&1 | ForEach-Object { "$_" }) -join "`n"
            $ErrorActionPreference = $old
            $st | Should Match 'A  meu-app/README.md'
            $st | Should Match 'A  README.md'
        } finally { Remove-FakeProfile }
    }
}
