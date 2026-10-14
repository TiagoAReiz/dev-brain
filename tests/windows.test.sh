#!/usr/bin/env bash
# Copia o repo para uma pasta temporária do Windows e roda os testes Pester via powershell.exe.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v powershell.exe >/dev/null 2>&1; then
  printf 'pulado: sem powershell.exe\n'
  exit 0
fi

wtemp="$(cd /mnt/c 2>/dev/null && cmd.exe /c 'echo %TEMP%' 2>/dev/null | tr -d '\r')"
tmp="$(wslpath "$wtemp")/dev-brain-wintest-$$"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp"

(cd "$raiz" && git ls-files -co --exclude-standard -z \
  | grep -zv -e '^habblaud/' -e '^memory/' \
  | tar --null -T - -cf -) | tar -xf - -C "$tmp"

winpath="$(wslpath -w "$tmp")"
set +e
(cd /mnt/c && powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$winpath\\tests\\windows\\run.ps1")
rc=$?
set -e
exit "$rc"
