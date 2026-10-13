#!/usr/bin/env bash
# Roda a fase shell do install-tools.sh com HOME temporário, duas vezes.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falha() { printf 'FALHOU: %s\n' "$*" >&2; exit 1; }

mkdir -p "$tmp/.config/fish"
HOME="$tmp" bash "$raiz/install-tools.sh" shell >/dev/null
HOME="$tmp" bash "$raiz/install-tools.sh" shell >/dev/null

conf="$tmp/.config/fish/conf.d/dev-brain.fish"
[ -f "$conf" ] || falha "conf do fish não criado"
grep -q 'set -gx DEV_BRAIN_HOME' "$conf" || falha "DEV_BRAIN_HOME ausente no fish"
grep -q 'fish_add_path -g $HOME/.local/bin' "$conf" || falha "PATH ausente no fish"
if command -v fish >/dev/null 2>&1; then
  fish -n "$conf" || falha "sintaxe inválida no fish"
fi
[ "$(grep -c '^# dev-brain$' "$tmp/.bashrc")" = 1 ] || falha "linha do dev-brain duplicada no .bashrc"
[ "$(grep -c '^# claude bypass$' "$tmp/.bashrc")" = 1 ] || falha "alias duplicado no .bashrc"

printf 'ok: install-tools shell\n'
