# Dot-source pelos testes. Estado guardado em $global: para sobreviver entre escopos do Pester.

function New-FakeProfile {
    $global:DevBrainTestOrig = @{
        USERPROFILE          = $env:USERPROFILE
        DEVBRAIN_NO_PERSIST  = $env:DEVBRAIN_NO_PERSIST
        DEVBRAIN_ASSUME      = $env:DEVBRAIN_ASSUME
        PATH                 = $env:PATH
    }
    $dir = Join-Path ([System.IO.Path]::GetTempPath()) ('dbprofile-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $global:DevBrainTestProfile = $dir
    $env:USERPROFILE = $dir
    $env:DEVBRAIN_NO_PERSIST = '1'
    $env:DEVBRAIN_ASSUME = 'n'
    return $dir
}

function Remove-FakeProfile {
    $orig = $global:DevBrainTestOrig
    if ($orig) {
        foreach ($k in 'USERPROFILE', 'DEVBRAIN_NO_PERSIST', 'DEVBRAIN_ASSUME', 'PATH') {
            if ($null -eq $orig[$k]) {
                Remove-Item "Env:$k" -ErrorAction SilentlyContinue
            } else {
                Set-Item "Env:$k" $orig[$k]
            }
        }
    }
    if ($global:DevBrainTestProfile -and (Test-Path -LiteralPath $global:DevBrainTestProfile)) {
        Remove-Item -LiteralPath $global:DevBrainTestProfile -Recurse -Force -ErrorAction SilentlyContinue
    }
    $global:DevBrainTestOrig = $null
    $global:DevBrainTestProfile = $null
}

function New-FakeBin {
    param([string]$Folder, [string]$Name, [string]$Body)
    New-Item -ItemType Directory -Path $Folder -Force | Out-Null
    $text = ($Body -replace "`r?`n", "`r`n")
    if (-not $text.EndsWith("`r`n")) { $text += "`r`n" }
    $path = Join-Path $Folder ($Name + '.cmd')
    [System.IO.File]::WriteAllText($path, $text, [System.Text.Encoding]::ASCII)
    $env:PATH = $Folder + ';' + $env:PATH
}
