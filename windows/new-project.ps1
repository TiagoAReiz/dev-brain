$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"

try {
    if ($args.Count -lt 1 -or $args.Count -gt 2) {
        throw 'uso: new-project.ps1 <nome> [caminho-do-repo-do-projeto]'
    }

    $devHome = Get-DevBrainHome
    $name = [string]$args[0]
    if ($name -cnotmatch '^[a-z0-9]+(-[a-z0-9]+)*$') {
        throw "nome inválido '$name': use só minúsculas, números e hífens (ex.: meu-app)."
    }

    if ($args.Count -ge 2) { $projectDir = [string]$args[1] } else { $projectDir = (Get-Location).ProviderPath }
    if (-not (Test-Path -LiteralPath $projectDir -PathType Container)) {
        throw "diretório do projeto não existe: $projectDir"
    }
    $projectDir = (Resolve-Path -LiteralPath $projectDir).ProviderPath.TrimEnd('\')
    if ($projectDir -ieq $devHome) {
        throw 'o caminho do projeto é o próprio dev-brain. Passe o caminho do repo do projeto.'
    }

    $memRoot = Join-Path $devHome 'memory'
    $memDir = Join-Path $memRoot $name
    $claudeMd = Join-Path $projectDir 'CLAUDE.md'
    $index = Join-Path $memRoot 'README.md'
    $tpl = Join-Path $devHome 'templates'
    $utf8 = New-Object System.Text.UTF8Encoding($false)

    # Checa tudo antes de criar qualquer coisa.
    if (Test-Path -LiteralPath $memDir) { throw "já existe: $memDir (nada foi alterado)" }
    if (Test-Path -LiteralPath $claudeMd) { throw "já existe: $claudeMd (nada foi alterado)" }
    if (-not (Test-Path -LiteralPath $index -PathType Leaf)) {
        New-Item -ItemType Directory -Path $memRoot -Force | Out-Null
        [System.IO.File]::WriteAllText($index, "# Memory`n`n", $utf8)   # sem a memória privada, começa um índice local
    }

    $today = Get-Date -Format 'yyyy-MM-dd'
    function Write-Rendered([string]$From, [string]$To) {
        $t = [System.IO.File]::ReadAllText($From) -replace "`r`n", "`n"
        $t = $t.Replace('{{NOME}}', $name).Replace('{{DATA}}', $today)
        [System.IO.File]::WriteAllText($To, $t, $utf8)
    }

    # Se algo falhar no meio, desfaz o que foi criado.
    $created = @()
    try {
        New-Item -ItemType Directory -Path (Join-Path $memDir 'specs') -Force | Out-Null
        $created += $memDir
        [System.IO.File]::WriteAllText((Join-Path $memDir 'specs\.gitkeep'), '', $utf8)
        foreach ($f in (Get-ChildItem -LiteralPath (Join-Path $tpl 'memory') -Filter '*.md.tpl')) {
            Write-Rendered $f.FullName (Join-Path $memDir ($f.Name -replace '\.tpl$', ''))
        }
        $created += $claudeMd
        Write-Rendered (Join-Path $tpl 'CLAUDE.md.tpl') $claudeMd
        [System.IO.File]::AppendAllText($index, "- [$name]($name/README.md): _descreva em 1 linha_`n", $utf8)
    } catch {
        foreach ($c in $created) { Remove-Item -LiteralPath $c -Recurse -Force -ErrorAction SilentlyContinue }
        throw
    }

    $staged = $false
    if (Test-MemoryRepo) {
        & git -C $memRoot add -- $name README.md
        if ($LASTEXITCODE -ne 0) { throw 'git add falhou no repo de memória.' }
        $staged = $true
    }

    Write-Host "Projeto `"$name`" criado."
    Write-Host "  memória:   $memDir"
    Write-Host "  CLAUDE.md: $claudeMd (não adicionado ao git do projeto)"
    Write-Host ''
    if ($staged) {
        Write-Host 'Staged no repo de memória (sem commit):'
        & git -C $memRoot status --short | ForEach-Object { Write-Host $_ }
    } else {
        Write-Warn 'Aviso: memory\ não é um repo git; a memória ficou só local (veja "Memória privada" no README).'
    }
    Write-Host ''
    Write-Host "Próximo: preencha memory/$name/README.md e a linha do índice, depois faça o commit."
} catch {
    Write-Err "Erro: $($_.Exception.Message)"
    exit 1
}
