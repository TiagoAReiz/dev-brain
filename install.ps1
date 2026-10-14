param(
    [string]$Dir = (Join-Path $env:USERPROFILE 'dev-brain'),
    [switch]$DryRun,
    [switch]$SetupDryRun
)

# Instalador do dev-brain para Windows. ASCII puro: roda via "irm ... | iex" ou salvo em arquivo.
function Install-DevBrain {
    param([string]$Dir, [bool]$DryRun, [bool]$SetupDryRun)

    $repo = 'https://github.com/TiagoAReiz/dev-brain.git'
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            if ($DryRun) {
                Write-Host '[dry-run] winget install --id Git.Git -e'
            } else {
                Write-Host 'git nao encontrado; instalando com winget...'
                & winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
                $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
                $u = [Environment]::GetEnvironmentVariable('Path', 'User')
                $env:PATH = (@($m, $u) | Where-Object { $_ }) -join ';'
                if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
                    throw 'Erro: git nao instalado. Instale (winget install --id Git.Git -e), abra um novo terminal e rode de novo.'
                }
            }
        }

        if (Test-Path -LiteralPath (Join-Path $Dir '.git')) {
            if ($DryRun) {
                Write-Host "[dry-run] git -C `"$Dir`" pull --ff-only"
            } else {
                Write-Host "dev-brain ja existe em $Dir; atualizando..."
                & git -C $Dir pull --ff-only
                if ($LASTEXITCODE -ne 0) { throw "Erro: git pull falhou em $Dir." }
            }
        } else {
            if ($DryRun) {
                Write-Host "[dry-run] git clone $repo `"$Dir`""
            } else {
                Write-Host "clonando o dev-brain em $Dir..."
                & git clone $repo $Dir
                if ($LASTEXITCODE -ne 0) { throw "Erro: git clone falhou para $Dir." }
            }
        }

        $setup = Join-Path $Dir 'windows\setup.ps1'
        $extra = ''
        if ($SetupDryRun) { $extra = ' -DryRun' }
        if ($DryRun) {
            Write-Host "[dry-run] powershell -NoProfile -ExecutionPolicy Bypass -File `"$setup`"$extra"
            return
        }
        if ($SetupDryRun) {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $setup -DryRun
        } else {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $setup
        }
        if ($LASTEXITCODE -ne 0) { throw 'Erro: o setup.ps1 falhou.' }
        Write-Host 'Pronto. Abra um novo terminal e rode: claude'
    } finally {
        $ErrorActionPreference = $old
    }
}

try {
    Install-DevBrain -Dir $Dir -DryRun ([bool]$DryRun) -SetupDryRun ([bool]$SetupDryRun)
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    if ($MyInvocation.MyCommand.Path) { exit 1 }
}
