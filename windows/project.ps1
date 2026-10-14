$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"

# project: gerencia projetos do GitHub em WORKFOLDER, integrado ao dev-brain.
#   project create [nome] [--public|--private]   cria repo + memória no dev-brain, abre o Claude
#   project start                                escolhe um repo, clona, abre o Claude
#   project exit                                 salva tudo no GitHub e limpa o workfolder

$script:DevHome = Get-DevBrainHome
if ($env:WORKFOLDER) { $script:Work = $env:WORKFOLDER } else { $script:Work = Join-Path (Get-UserHome) 'workfolder' }
$script:Kickoff = ''

# Executa um comando nativo sem deixar o stderr virar erro; devolve o código de saída.
function Invoke-Quiet {
    param([string]$Exe, [string[]]$ArgList)
    $ErrorActionPreference = 'Continue'
    & $Exe @ArgList 2>&1 | Out-Null
    return $LASTEXITCODE
}

# Executa um comando nativo e devolve só o stdout (linhas); o stderr é descartado.
function Get-NativeLines {
    param([string]$Exe, [string[]]$ArgList)
    $ErrorActionPreference = 'Continue'
    return @(& $Exe @ArgList 2>$null | ForEach-Object { "$_" })
}

function Read-Line {
    param([string]$Prompt)
    Write-Host $Prompt -NoNewline
    $r = [Console]::ReadLine()
    if ($null -eq $r) { return '' }
    return $r
}

function Test-Deps {
    if (-not (Test-Command 'gh')) {
        throw "'gh' não está instalado. Rode o windows\setup.ps1 (ou: winget install --id GitHub.cli -e) e depois: gh auth login"
    }
    if ((Invoke-Quiet 'gh' @('auth', 'status')) -ne 0) { throw 'gh não está logado. Rode: gh auth login' }
}

function Open-Claude {
    param([string]$Dir, [string]$Prompt)
    $cmd = $env:DEVBRAIN_CLAUDE
    if (-not $cmd) { $cmd = 'claude' }
    if (-not (Test-Command $cmd)) { throw "'$cmd' não está instalado. Instale o Claude Code (veja o windows\setup.ps1)." }
    Write-Info "Abrindo o Claude Code em $Dir..."
    Set-Location -LiteralPath $Dir
    $ErrorActionPreference = 'Continue'
    if ($Prompt) { & $cmd --dangerously-skip-permissions $Prompt } else { & $cmd --dangerously-skip-permissions }
    exit $LASTEXITCODE
}

function Get-KickoffPrompt {
    param([string]$Name)
    return "Use a skill kickoff para preencher a memória do projeto $Name no dev-brain."
}

# Commita e envia a memória recém-criada (a memória é um repo privado à parte, em <dev-brain>\memory).
function Save-NewMemory {
    param([string]$Mem)
    if (-not (Test-MemoryRepo)) {
        Write-Warn "memory\ não é um repo git; memória '$Mem' criada só localmente."
        return
    }
    $m = Join-Path $script:DevHome 'memory'
    if ((Invoke-Quiet 'git' @('-C', $m, 'add', '--', $Mem, 'README.md')) -ne 0 -or
        (Invoke-Quiet 'git' @('-C', $m, 'commit', '-q', '-m', "memory($Mem): cria projeto", '--', $Mem, 'README.md')) -ne 0) {
        Write-Warn 'Não consegui commitar a memória.'
        return
    }
    if ((Invoke-Quiet 'git' @('-C', $m, 'push', '-q')) -eq 0) {
        Write-Ok "Memória '$Mem' commitada e enviada."
    } else {
        Write-Warn 'Memória commitada, mas o push falhou.'
    }
}

# Atualiza o dev-brain (memória, skills) antes de começar a trabalhar.
function Sync-DevBrain {
    $st = @(Get-NativeLines 'git' @('-C', $script:DevHome, 'status', '--porcelain'))
    if ($st.Count -gt 0) {
        Write-Warn 'dev-brain tem mudanças locais; pulando o pull.'
        return
    }
    if ((Invoke-Quiet 'git' @('-C', $script:DevHome, 'pull', '-q', '--ff-only')) -eq 0) {
        Write-Ok 'dev-brain atualizado.'
    } else {
        Write-Warn 'Não consegui dar pull no dev-brain; seguindo com a versão local.'
    }
}

# Valida um nome de projeto; devolve o motivo se for inválido, senão $null.
function Get-NameProblem {
    param([string]$Name)
    if ($Name -cnotmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { return 'use só minúsculas, números e hífens (ex.: meu-app)' }
    $d = Join-Path $script:Work $Name
    if (Test-Path -LiteralPath $d) { return "'$d' já existe" }
    if (Test-Path -LiteralPath (Join-Path $script:DevHome "memory\$Name")) { return "a memória '$Name' já existe no dev-brain" }
    return $null
}

# Roda o new-project.ps1 em processo filho; lança erro se falhar.
function Invoke-NewProject {
    param([string]$Name, [string]$Dir)
    $script = Join-Path $script:DevHome 'windows\new-project.ps1'
    $ErrorActionPreference = 'Continue'
    $out = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $script $Name $Dir 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) {
        $out | ForEach-Object { Write-Err $_ }
        return $false
    }
    return $true
}

function Invoke-Create {
    param([string[]]$CreateArgs)
    $name = ''
    $visibility = ''
    foreach ($a in $CreateArgs) {
        if ($a -ceq '--public') { $visibility = '--public' }
        elseif ($a -ceq '--private') { $visibility = '--private' }
        elseif ($a.StartsWith('-')) { throw "opção desconhecida: $a" }
        else { $name = $a }
    }

    if ($name) {
        $problem = Get-NameProblem $name
        if ($problem) { throw "nome '$name': $problem." }
    } else {
        while ($true) {
            $name = Read-Line '  Nome do projeto (repo e memória): '
            $problem = Get-NameProblem $name
            if ($name -and -not $problem) { break }
            if (-not $name) { $problem = 'o nome não pode ser vazio' }
            Write-Host "  $problem" -ForegroundColor Red
        }
    }

    if (-not $visibility) {
        Write-Host '  Visibilidade do repo no GitHub:'
        Write-Host '    1) privado (padrão)'
        Write-Host '    2) público'
        $choice = Read-Line '  Escolha [1]: '
        if ($choice -in @('2', 'p', 'pub', 'publico', 'público')) { $visibility = '--public' } else { $visibility = '--private' }
    }

    Test-Deps

    $dir = Join-Path $script:Work $name
    Write-Info "Criando o projeto $name..."
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Set-Location -LiteralPath $dir
    if ((Invoke-Quiet 'git' @('init', '-q', '-b', 'main')) -ne 0) { throw 'git init falhou.' }
    [System.IO.File]::WriteAllText((Join-Path $dir 'README.md'), "# $name`n", (New-Object System.Text.UTF8Encoding($false)))

    # Memória no dev-brain + CLAUDE.md do projeto apontando para ela.
    if (-not (Invoke-NewProject $name $dir)) { throw 'new-project.ps1 falhou.' }
    Save-NewMemory $name

    Invoke-Quiet 'git' @('add', 'README.md', 'CLAUDE.md') | Out-Null
    if ((Invoke-Quiet 'git' @('commit', '-q', '-m', 'Initial commit')) -ne 0) {
        throw 'commit inicial falhou (git user.name/email configurados?).'
    }

    Write-Info "Criando o repositório no GitHub ($($visibility.Substring(2)))..."
    $ErrorActionPreference = 'Continue'
    & gh repo create $name $visibility --source=. --remote=origin --push 2>&1 | ForEach-Object { Write-Host "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -eq 0) {
        Write-Ok "Projeto '$name' criado e enviado para o GitHub!"
    } else {
        Write-Warn "Falhou ao criar o repo no GitHub. O projeto local ficou em $dir."
    }

    Open-Claude $dir (Get-KickoffPrompt $name)
}

# Se o repo não tem memória no dev-brain, oferece criar.
function Request-Memory {
    param([string]$Dir, [string]$RepoName)
    $mem = Get-Slug $RepoName
    if (Test-Path -LiteralPath (Join-Path $script:DevHome "memory\$mem") -PathType Container) { return }
    if (Test-Path -LiteralPath (Join-Path $Dir 'CLAUDE.md')) {
        Write-Warn "Sem memória 'memory/$mem' no dev-brain, e o repo já tem CLAUDE.md. Crie na mão se quiser."
        return
    }
    if (-not (Read-YesNo "Projeto sem memória no dev-brain. Criar 'memory/$mem' e fazer o kickoff?")) { return }
    if (Invoke-NewProject $mem $Dir) {
        Save-NewMemory $mem
        $script:Kickoff = $mem
    } else {
        Write-Warn 'new-project.ps1 falhou; seguindo sem memória.'
    }
}

# Mostra onde o projeto parou, segundo a memória.
function Show-State {
    param([string]$RepoName)
    $f = Join-Path $script:DevHome ('memory\' + (Get-Slug $RepoName) + '\estado-atual.md')
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return }
    Write-Host ''
    Write-Host 'Estado atual (dev-brain):'
    $inBody = $false
    foreach ($line in ([System.IO.File]::ReadAllText($f) -split "`r?`n")) {
        if ($line.StartsWith('## ')) { $inBody = $true }
        if ($inBody -or $line.StartsWith('**Última')) { Write-Host "  $line" }
    }
    Write-Host ''
}

function Invoke-Start {
    Test-Deps
    Sync-DevBrain

    Write-Info 'Buscando seus repositórios no GitHub...'
    $repos = @(@(Get-NativeLines 'gh' @('repo', 'list', '--limit', '200', '--json', 'nameWithOwner', '-q', '.[].nameWithOwner')) | Where-Object { $_ })
    if ($repos.Count -eq 0) { throw 'nenhum repositório encontrado.' }

    $selected = ''
    if (Test-Command 'fzf') {
        $ErrorActionPreference = 'Continue'
        $pick = @($repos | & fzf '--prompt=  Repo > ' '--height=50%' '--border=rounded' '--header=Repositórios do GitHub' '--header-first' '--color=header:bold')
        $ErrorActionPreference = 'Stop'
        if ($pick.Count -gt 0) { $selected = "$($pick[0])".Trim() }
    } else {
        Write-Host ''
        for ($i = 0; $i -lt $repos.Count; $i++) {
            Write-Host ('  {0,3}) {1}' -f ($i + 1), $repos[$i]) 
        }
        Write-Host ''
        $choice = Read-Line 'Número: '
        $n = 0
        if (-not ([int]::TryParse($choice, [ref]$n)) -or $n -lt 1 -or $n -gt $repos.Count) { throw 'seleção inválida.' }
        $selected = $repos[$n - 1]
    }

    if (-not $selected) {
        Write-Warn 'Nenhum repositório selecionado.'
        exit 0
    }

    $repoName = $selected.Split('/')[-1]
    $dir = Join-Path $script:Work $repoName

    if (Test-Path -LiteralPath $dir -PathType Container) {
        Write-Warn 'Pasta já existe, abrindo o Claude nela...'
    } else {
        Write-Info "Clonando $selected..."
        New-Item -ItemType Directory -Path $script:Work -Force | Out-Null
        if ((Invoke-Quiet 'gh' @('repo', 'clone', $selected, $dir, '--', '-q')) -ne 0) { throw "falhou ao clonar $selected." }
        Write-Ok "Clonado em $dir"
    }

    $script:Kickoff = ''
    Request-Memory $dir $repoName
    if ($script:Kickoff) { Open-Claude $dir (Get-KickoffPrompt $script:Kickoff) }
    Show-State $repoName
    Open-Claude $dir ''
}

# Salva um repo no GitHub. Devolve $true só se TUDO estiver no remoto.
function Save-Repo {
    param([string]$Dir, [string]$RepoName)
    Set-Location -LiteralPath $Dir
    $ErrorActionPreference = 'Continue'

    # Repos git aninhados: o git add -A os trataria como submódulo e o conteúdo se perderia.
    $ownGit = Join-Path $Dir '.git'
    $nested = @(Get-ChildItem -LiteralPath $Dir -Recurse -Force -Directory -Filter '.git' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -ne $ownGit })
    if ($nested.Count -gt 0) {
        Write-Host "  AVISO: repos git aninhados em '$RepoName':" -ForegroundColor Red
        foreach ($n in $nested) { Write-Host "    -> $(Split-Path -Parent $n.FullName)" -ForegroundColor Yellow }
        if (-not (Read-YesNo 'Remover os .git internos (perde o histórico deles) e salvar tudo?')) { return $false }
        foreach ($n in $nested) {
            Remove-Item -LiteralPath $n.FullName -Recurse -Force
            Write-Ok "  Removido: $($n.FullName)"
        }
    }

    # Arquivos ignorados tipo .env não vão para o GitHub e seriam apagados com a pasta.
    $secrets = @(@(Get-NativeLines 'git' @('ls-files', '--others', '--ignored', '--exclude-standard')) |
        Where-Object { $_ -match '(^|/)\.env' -and $_ -notmatch '\.env\.example$' })
    if ($secrets.Count -gt 0) {
        Write-Warn '  Arquivos ignorados que NÃO vão para o GitHub:'
        $secrets | ForEach-Object { Write-Host "    -> $_" }
        if (-not (Read-YesNo 'Apagar mesmo assim quando limpar a pasta?')) { return $false }
    }

    # Scanner conservador, save e verificação no origin são os mesmos do modo JSON.
    $js = @'
try { require(process.argv[1]).saveRepo(process.argv[2]); console.log('  Projeto salvo e confirmado no origin.'); } catch (error) { console.error('  Mantido: ' + error.message); process.exitCode = 1; }
'@
    $lib = Join-Path $script:DevHome 'lib\project-json.cjs'
    & node -e $js $lib $Dir 2>&1 | ForEach-Object { Write-Host "$_" }
    return ($LASTEXITCODE -eq 0)
}

function Invoke-Exit {
    Test-Deps
    $label = Get-Date -Format 'yyyy-MM-dd'
    Write-Info 'Salvando os projetos no GitHub...'

    $saved = @()
    $kept = @()
    if (Test-Path -LiteralPath $script:Work -PathType Container) {
        foreach ($d in @(Get-ChildItem -LiteralPath $script:Work -Directory | Sort-Object Name)) {
            Write-Host ''
            Write-Host "--- $($d.Name) ---"
            if (-not (Test-Path -LiteralPath (Join-Path $d.FullName '.git'))) {
                Write-Warn '  Não é repo git; mantido.'
                $kept += $d.Name
                continue
            }
            if (Save-Repo $d.FullName $d.Name) {
                $saved += $d.FullName
            } else {
                Write-Warn '  Mantido localmente; nada foi apagado.'
                $kept += $d.Name
            }
        }
    }
    Set-Location -LiteralPath (Get-UserHome)

    Write-Host ''
    Write-Host '--- memória ---'
    Save-MemoryRepo -Label $label
    if (@(Get-NativeLines 'git' @('-C', $script:DevHome, 'status', '--porcelain')).Count -gt 0) {
        Write-Warn '  Há mudanças no dev-brain (código/skills) não commitadas (não mexi nelas).'
    }

    Write-Host ''
    Write-Info 'Limpando o workfolder...'
    # Só apaga o que foi confirmado no GitHub. Arquivos soltos no workfolder ficam.
    foreach ($d in $saved) { Remove-Item -LiteralPath $d -Recurse -Force }

    if ($kept.Count -gt 0) {
        Write-Host ''
        Write-Warn "Atenção: $($kept.Count) pasta(s) mantida(s) no workfolder:"
        foreach ($k in $kept) { Write-Host "  -> $k" -ForegroundColor Red }
        Write-Warn "Resolva na mão antes de rodar 'project exit' de novo."
    } else {
        Write-Ok 'Pronto! Workfolder limpo.'
    }
}

function Show-Help {
    Write-Host ''
    Write-Host "  project: projetos do GitHub em $($script:Work), com memória no dev-brain"
    Write-Host ''
    Write-Host '  project create [nome] [--public|--private]' -ForegroundColor Green
    Write-Host '      Cria o repo (privado por padrão) e a memória no dev-brain, abre o Claude no kickoff'
    Write-Host ''
    Write-Host '  project start' -ForegroundColor Green
    Write-Host '      Escolhe um repo, clona, oferece criar a memória e abre o Claude'
    Write-Host ''
    Write-Host '  project exit' -ForegroundColor Green
    Write-Host '      Salva tudo no GitHub, oferece commitar a memória e limpa o workfolder'
    Write-Host ''
}

try {
    # Modos de máquina nunca leem stdin nem misturam mensagens de terminal no JSON.
    foreach ($a in $args) {
        if ($a -ceq '--json') {
            if (-not (Test-Command 'node')) { throw 'instale Node 22+.' }
            & node (Join-Path $script:DevHome 'lib\project-json.cjs') @args
            exit $LASTEXITCODE
        }
    }

    $cmd = ''
    if ($args.Count -gt 0) { $cmd = [string]$args[0] }
    $rest = @()
    if ($args.Count -gt 1) { $rest = @($args[1..($args.Count - 1)] | ForEach-Object { [string]$_ }) }
    switch -CaseSensitive ($cmd) {
        'create' { Invoke-Create $rest }
        'start'  { Invoke-Start }
        'exit'   { Invoke-Exit }
        default  { Show-Help }
    }
} catch {
    Write-Err "Erro: $($_.Exception.Message)"
    exit 1
}
