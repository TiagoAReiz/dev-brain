$ErrorActionPreference = 'Stop'

try {
    Import-Module Pester -MaximumVersion 3.99.99
} catch {
    [Console]::Error.WriteLine('Erro: Pester 3.x não encontrado (Install-Module Pester -RequiredVersion 3.4.0 -Scope CurrentUser).')
    exit 1
}

$resultado = Invoke-Pester -Path $PSScriptRoot -PassThru
if ($resultado.FailedCount -gt 0) { exit 1 }
Write-Host 'ok: windows'
