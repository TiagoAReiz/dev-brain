. "$PSScriptRoot\helpers.ps1"
. "$PSScriptRoot\..\..\windows\lib.ps1"

function Write-TestFile([string]$Path, [string]$Text) {
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-TestGit {
    param([string]$Repo)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { return @(& git -C $Repo @args 2>&1 | ForEach-Object { "$_" }) } finally { $ErrorActionPreference = $old }
}

Describe 'carregar lib.ps1' {
    It 'não escreve nada na tela nem altera o ambiente' {
        $antes = $env:PATH
        $saida = & { . "$PSScriptRoot\..\..\windows\lib.ps1" } *>&1 | Out-String
        $saida.Trim() | Should Be ''
        $env:PATH | Should Be $antes
    }
}

Describe 'Get-DevBrainHome / Get-UserHome' {
    It 'Get-DevBrainHome é a pasta pai de windows, sem barra final' {
        $expected = (Resolve-Path "$PSScriptRoot\..\..").Path.TrimEnd('\')
        (Get-DevBrainHome) | Should Be $expected
    }
    It 'Get-UserHome lê USERPROFILE na hora' {
        $p = New-FakeProfile
        try { (Get-UserHome) | Should Be $p } finally { Remove-FakeProfile }
    }
}

Describe 'Write-*' {
    It 'Write-Info/Ok/Warn escrevem o texto' {
        $saida = & { Write-Info 'a1'; Write-Ok 'b2'; Write-Warn 'c3' } *>&1 | Out-String
        $saida | Should Match 'a1'
        $saida | Should Match 'b2'
        $saida | Should Match 'c3'
    }
    It 'Write-Err escreve no stderr' {
        $libPath = (Resolve-Path "$PSScriptRoot\..\..\windows\lib.ps1").Path
        $cmd = ". '$libPath'; Write-Err 'falhou-xyz'"
        $old = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try { $saida = (& powershell -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1 | ForEach-Object { "$_" }) -join "`n" } finally { $ErrorActionPreference = $old }
        $saida | Should Match 'falhou-xyz'
    }
}

Describe 'Read-YesNo' {
    BeforeEach { $script:oldAssume = $env:DEVBRAIN_ASSUME }
    AfterEach {
        if ($null -eq $script:oldAssume) { Remove-Item Env:DEVBRAIN_ASSUME -ErrorAction SilentlyContinue }
        else { $env:DEVBRAIN_ASSUME = $script:oldAssume }
    }
    It 'y e Y são sim' {
        $env:DEVBRAIN_ASSUME = 'y'
        (Read-YesNo 'ok?') | Should Be $true
        $env:DEVBRAIN_ASSUME = 'Y'
        (Read-YesNo 'ok?') | Should Be $true
    }
    It 'n e qualquer outra coisa são não' {
        $env:DEVBRAIN_ASSUME = 'n'
        (Read-YesNo 'ok?') | Should Be $false
        $env:DEVBRAIN_ASSUME = 'yes'
        (Read-YesNo 'ok?') | Should Be $false
    }
}

Describe 'Test-Command' {
    It 'encontra comando existente e rejeita inexistente' {
        (Test-Command 'powershell') | Should Be $true
        (Test-Command 'comando-que-nao-existe-xyz') | Should Be $false
    }
}

Describe 'Get-Slug' {
    It 'normaliza o texto' {
        (Get-Slug 'Meu App Legal!') | Should Be 'meu-app-legal'
        (Get-Slug '  --Olá__Mundo--  ') | Should Be 'ol-mundo'
        (Get-Slug 'abc') | Should Be 'abc'
        (Get-Slug 'A1  B2') | Should Be 'a1-b2'
    }
}

Describe 'New-LinkOrCopy' {
    BeforeEach { $script:p = New-FakeProfile }
    AfterEach { Remove-FakeProfile }

    It 'Dir: cria junction, depois ok' {
        $src = Join-Path $script:p 'src'
        Write-TestFile (Join-Path $src 'a.txt') 'x'
        $dest = Join-Path $script:p 'sub\dest'
        $r = New-LinkOrCopy -Source $src -Dest $dest -Kind Dir
        $r.Action | Should Be 'created'
        $r.Mode | Should Be 'junction'
        (Test-Path -LiteralPath (Join-Path $dest 'a.txt')) | Should Be $true
        $r2 = New-LinkOrCopy -Source $src -Dest $dest -Kind Dir
        $r2.Action | Should Be 'ok'
        $r2.Mode | Should Be 'junction'
        @(Get-ChildItem -LiteralPath (Split-Path $dest) -Filter '*.bak.*').Count | Should Be 0
    }

    It 'Dir: pasta real no destino é movida para .bak e preservada' {
        $src = Join-Path $script:p 'src'
        Write-TestFile (Join-Path $src 'a.txt') 'novo'
        $dest = Join-Path $script:p 'dest'
        Write-TestFile (Join-Path $dest 'velho.txt') 'antigo'
        $r = New-LinkOrCopy -Source $src -Dest $dest -Kind Dir
        $r.Action | Should Be 'replaced'
        $r.Mode | Should Be 'junction'
        $bak = @(Get-ChildItem -LiteralPath $script:p -Filter 'dest.bak.*')
        $bak.Count | Should Be 1
        $bak[0].Name | Should Match '^dest\.bak\.\d{8}-\d{6}$'
        [System.IO.File]::ReadAllText((Join-Path $bak[0].FullName 'velho.txt')) | Should Be 'antigo'
    }

    It 'File: cria symlink ou cópia, depois ok' {
        $src = Join-Path $script:p 'src.md'
        Write-TestFile $src 'conteudo'
        $dest = Join-Path $script:p 'sub\dest.md'
        $r = New-LinkOrCopy -Source $src -Dest $dest -Kind File
        $r.Action | Should Be 'created'
        ($r.Mode -eq 'symlink' -or $r.Mode -eq 'copy') | Should Be $true
        [System.IO.File]::ReadAllText($dest) | Should Be 'conteudo'
        $r2 = New-LinkOrCopy -Source $src -Dest $dest -Kind File
        $r2.Action | Should Be 'ok'
        @(Get-ChildItem -LiteralPath (Split-Path $dest) -Filter '*.bak.*').Count | Should Be 0
    }

    It 'File: arquivo diferente é movido para .bak preservando o conteúdo' {
        $src = Join-Path $script:p 'src.md'
        Write-TestFile $src 'novo'
        $dest = Join-Path $script:p 'dest.md'
        Write-TestFile $dest 'antigo'
        $r = New-LinkOrCopy -Source $src -Dest $dest -Kind File
        $r.Action | Should Be 'replaced'
        $bak = @(Get-ChildItem -LiteralPath $script:p -Filter 'dest.md.bak.*')
        $bak.Count | Should Be 1
        $bak[0].Name | Should Match '^dest\.md\.bak\.\d{8}-\d{6}$'
        [System.IO.File]::ReadAllText($bak[0].FullName) | Should Be 'antigo'
        [System.IO.File]::ReadAllText($dest) | Should Be 'novo'
    }

    It 'File: cópia desatualizada vira replaced; cópia igual vira ok' {
        $src = Join-Path $script:p 'src.md'
        $dest = Join-Path $script:p 'dest.md'
        Write-TestFile $src 'v1'
        Write-TestFile $dest 'v1'
        (New-LinkOrCopy -Source $src -Dest $dest -Kind File).Action | Should Be 'ok'
        Write-TestFile $src 'v2'
        (New-LinkOrCopy -Source $src -Dest $dest -Kind File).Action | Should Be 'replaced'
    }
}

Describe 'Set-UserEnv' {
    BeforeEach { $script:p = New-FakeProfile; $script:oldFoo = $env:DB_TEST_FOO }
    AfterEach {
        Remove-FakeProfile
        if ($null -eq $script:oldFoo) { Remove-Item Env:DB_TEST_FOO -ErrorAction SilentlyContinue }
        else { $env:DB_TEST_FOO = $script:oldFoo }
    }
    It 'com NO_PERSIST atualiza só $env e é idempotente' {
        (Set-UserEnv 'DB_TEST_FOO' 'bar') | Should Be $true
        $env:DB_TEST_FOO | Should Be 'bar'
        [Environment]::GetEnvironmentVariable('DB_TEST_FOO', 'User') | Should BeNullOrEmpty
        (Set-UserEnv 'DB_TEST_FOO' 'bar') | Should Be $false
        (Set-UserEnv 'DB_TEST_FOO' 'baz') | Should Be $true
    }
}

Describe 'Add-UserPath' {
    BeforeEach { $script:p = New-FakeProfile }
    AfterEach { Remove-FakeProfile }
    It 'acrescenta uma vez, ignorando maiúsculas e barra final' {
        $dir = Join-Path $script:p 'bin'
        (Add-UserPath $dir) | Should Be $true
        ($env:PATH -split ';') -contains $dir | Should Be $true
        (Add-UserPath $dir) | Should Be $false
        (Add-UserPath ($dir.ToUpper() + '\')) | Should Be $false
    }
}

Describe 'Test-MemoryRepo / Save-MemoryRepo' {
    BeforeEach {
        $script:p = New-FakeProfile
        $script:fakeHome = Join-Path $script:p 'devbrain'
        New-Item -ItemType Directory -Path $script:fakeHome -Force | Out-Null
        Mock Get-DevBrainHome { $script:fakeHome }
    }
    AfterEach { Remove-FakeProfile }

    function New-MemoryRepo {
        $mem = Join-Path $script:fakeHome 'memory'
        New-Item -ItemType Directory -Path $mem -Force | Out-Null
        Invoke-TestGit $mem init -q
        Invoke-TestGit $mem config user.name teste
        Invoke-TestGit $mem config user.email teste@example.com
        Invoke-TestGit $mem config commit.gpgsign false
        Write-TestFile (Join-Path $mem 'a.md') 'um'
        return $mem
    }

    It 'Test-MemoryRepo é falso sem memory\.git' {
        (Test-MemoryRepo) | Should Be $false
    }

    It 'sem repo só informa' {
        $saida = & { Save-MemoryRepo } *>&1 | Out-String
        $saida | Should Match 'não é um repo git'
    }

    It 'com mudanças e ASSUME=y faz commit' {
        $mem = New-MemoryRepo
        (Test-MemoryRepo) | Should Be $true
        $env:DEVBRAIN_ASSUME = 'y'
        & { Save-MemoryRepo -Label 'teste' } *>&1 | Out-Null
        $msg = (Invoke-TestGit $mem log -1 --format=%s)
        $msg | Should Match '^memory: sess'
        $msg | Should Match 'teste$'
        (Invoke-TestGit $mem status --short) | Should BeNullOrEmpty
    }

    It 'com mudanças e ASSUME=n não commita' {
        $mem = New-MemoryRepo
        $env:DEVBRAIN_ASSUME = 'n'
        & { Save-MemoryRepo -Label 'teste' } *>&1 | Out-Null
        (Invoke-TestGit $mem rev-parse --verify -q HEAD) | Should BeNullOrEmpty
        (Invoke-TestGit $mem status --short) | Should Not BeNullOrEmpty
    }
}
