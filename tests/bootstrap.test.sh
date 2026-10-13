#!/usr/bin/env bash
# Roda o bootstrap.sh com um HOME temporário e confere symlinks e o CLAUDE.maquina.md.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falha() { printf 'FALHOU: %s\n' "$*" >&2; exit 1; }

mkdir -p "$tmp/.claude"
printf '@RTK.md\n' > "$tmp/.claude/CLAUDE.md"   # máquina com CLAUDE.md próprio

HOME="$tmp" bash "$raiz/bootstrap.sh" >/dev/null

[ "$(readlink "$tmp/.claude/CLAUDE.md")" = "$raiz/global/CLAUDE.md" ] || falha "CLAUDE.md global não linkado"
ls "$tmp"/.claude/CLAUDE.md.bak.* >/dev/null 2>&1 || falha "backup do CLAUDE.md antigo não criado"
for a in "$raiz"/global/agents/*.md; do
  [ "$(readlink "$tmp/.claude/agents/$(basename "$a")")" = "$a" ] || falha "agente não linkado: $(basename "$a")"
done
[ -f "$tmp/.claude/CLAUDE.maquina.md" ] || falha "CLAUDE.maquina.md não criado"
grep -q '@~/.claude/CLAUDE.maquina.md' "$raiz/global/CLAUDE.md" || falha "global/CLAUDE.md não importa o CLAUDE.maquina.md"

printf '@RTK.md\n' > "$tmp/.claude/CLAUDE.maquina.md"
HOME="$tmp" bash "$raiz/bootstrap.sh" >/dev/null
grep -qx '@RTK.md' "$tmp/.claude/CLAUDE.maquina.md" || falha "CLAUDE.maquina.md foi sobrescrito"

printf 'ok: bootstrap\n'
