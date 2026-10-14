# brain: o comando do dia a dia do dev-brain no Windows (versão nativa do bin/brain).
#   brain           atualiza o dev-brain, ressincroniza os links e mostra o status
#   brain down      salva a memória no GitHub (se houver repo de memória)
#   brain status    mostra o que está local e o que falta enviar
#   brain setup     configura este PC (setup.ps1; aceita -DryRun e -SemFerramentas)
param(
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Todos
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib.ps1"

# Todos os argumentos chegam crus (inclui -h e --help, que o binder não casaria com parâmetro).
$Comando = if ($Todos) { [string]$Todos[0] } else { '' }
$Resto = @($Todos | Select-Object -Skip 1)

function Invoke-GitLocal {
    param([string]$Folder, [string[]]$GitArgs)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        return @(& git -C $Folder @GitArgs 2>$null | ForEach-Object { "$_" })
    } finally {
        $ErrorActionPreference = $old
    }
}

function Show-Ajuda {
    Write-Host 'brain: o comando do dia a dia do dev-brain (Windows).'
    Write-Host ''
    Write-Host '  brain           atualiza o dev-brain, ressincroniza os links e mostra o status'
    Write-Host '  brain down      salva a memória no GitHub (se houver repo de memória)'
    Write-Host '  brain status    mostra o que está local e o que falta enviar'
    Write-Host '  brain setup     configura este PC (setup.ps1; aceita -DryRun e -SemFerramentas)'
    Write-Host '  brain ajuda     mostra esta ajuda'
}

function Show-Status {
    param([string]$DevHome)
    $mud = @(Invoke-GitLocal $DevHome @('status', '--porcelain')).Count
    $pend = @(Invoke-GitLocal $DevHome @('log', '@{u}..', '--oneline')).Count
    Write-Host "  dev-brain: $mud mudança(s) local(is), $pend commit(s) sem push"
    if (Test-MemoryRepo) {
        $mem = Join-Path $DevHome 'memory'
        $mMud = @(Invoke-GitLocal $mem @('status', '--porcelain')).Count
        $mPend = @(Invoke-GitLocal $mem @('log', '@{u}..', '--oneline')).Count
        Write-Host "  memory: $mMud mudança(s) local(is), $mPend commit(s) sem push"
    } else {
        Write-Host '  memory: sem memória privada configurada (memory\ não é um repo git).'
    }
}

try {
    $devHome = Get-DevBrainHome

    switch ($Comando) {
        '' {
            if (Test-Path -LiteralPath (Join-Path $devHome '.git')) {
                $mud = @(Invoke-GitLocal $devHome @('status', '--porcelain'))
                if ($mud.Count -eq 0) {
                    Invoke-GitLocal $devHome @('pull', '-q', '--ff-only') | Out-Null
                    if ($LASTEXITCODE -ne 0) { Write-Warn 'Não consegui atualizar o dev-brain (git pull); seguindo com a versão local.' }
                } else {
                    Write-Warn 'dev-brain tem mudanças locais; pulando o git pull.'
                }
            }
            & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\bootstrap.ps1"
            if ($LASTEXITCODE -ne 0) { throw 'bootstrap falhou' }
            Show-Status -DevHome $devHome
            Write-Info 'Habblaud (painel visual) ainda não tem versão nativa no Windows; use o WSL para ele.'
        }
        'down' {
            Save-MemoryRepo
        }
        'status' {
            Show-Status -DevHome $devHome
        }
        'setup' {
            & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\setup.ps1" @Resto
            exit $LASTEXITCODE
        }
        { $_ -in 'ajuda', 'help', '-h', '--help' } {
            Show-Ajuda
        }
        default {
            Write-Err "brain: comando desconhecido '$Comando'"
            Show-Ajuda
            exit 1
        }
    }
} catch {
    Write-Err $_.Exception.Message
    exit 1
}
