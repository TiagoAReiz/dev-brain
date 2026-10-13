#!/usr/bin/env bash
# Testa as funções puras do lib/habblaud.sh com um dev-brain falso e HOME temporário.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falha() { printf 'FALHOU: %s\n' "$*" >&2; exit 1; }

for s in setup.sh up.sh down.sh lib/habblaud.sh; do bash -n "$raiz/$s" || falha "sintaxe: $s"; done

# dev-brain falso: habblaud/ commitado, dist/ ignorado
fake="$tmp/dev-brain"
mkdir -p "$fake/habblaud/dist/server"
printf 'dist/\nnode_modules/\n' > "$fake/habblaud/.gitignore"
printf 'x\n' > "$fake/habblaud/server.ts"
git -C "$fake" init -q -b main
git -C "$fake" add -A
git -C "$fake" -c user.name=t -c user.email=t@t commit -qm base

export HOME="$tmp/home" DEV_BRAIN_HOME="$fake" HABBLAUD_SEM_SYSTEMD=1
mkdir -p "$HOME"
# shellcheck source=../lib/habblaud.sh
. "$raiz/lib/habblaud.sh"

# unit do systemd
unit="$(hb_unit /opt/node/bin/node /opt/bin/claude /a:/b)"
grep -qx "WorkingDirectory=$fake/habblaud" <<<"$unit" || falha "WorkingDirectory"
grep -qx "ExecStart=/opt/node/bin/node dist/server/index.js" <<<"$unit" || falha "ExecStart"
grep -qx "Environment=HABBLAUD_PTY=1" <<<"$unit" || falha "PTY"
grep -qx "Environment=HABBLAUD_CLAUDE_BIN=/opt/bin/claude" <<<"$unit" || falha "CLAUDE_BIN"
grep -qx 'Environment="PATH=/a:/b"' <<<"$unit" || falha "PATH"

grep -Fxq "Environment=\"DEV_BRAIN_HOME=$fake\"" <<<"$unit" || falha "DEV_BRAIN_HOME"

# QA/instâncias isoladas não usam o PID nem o relatório da instância padrão.
isolado="$(HABBLAUD_DATA_DIR="$tmp/dados-isolados" bash -c ". '$raiz/lib/habblaud.sh'; printf '%s' \"\$HB_PID\"")"
[ "$isolado" = "$tmp/dados-isolados/server.pid" ] || falha "DATA_DIR do PID"

# precisa de build: sem dist, sem marca, marca velha, código sujo
hb_precisa_build || falha "sem dist deveria precisar de build"
touch "$fake/habblaud/dist/server/index.js"
hb_precisa_build || falha "sem marca deveria precisar de build"
mkdir -p "$HB_DADOS" && hb_versao > "$HB_MARCA"
! hb_precisa_build || falha "com marca atual não deveria precisar de build"
printf 'y\n' >> "$fake/habblaud/server.ts"
hb_precisa_build || falha "com mudança local deveria precisar de build"
git -C "$fake" -c user.name=t -c user.email=t@t commit -qam muda
hb_precisa_build || falha "com commit novo (marca velha) deveria precisar de build"

# sem systemd, instalar o serviço não faz nada
hb_instalar_servico
[ ! -e "$HB_UNIT" ] || falha "não deveria criar unit sem systemd"

# ~/.local/bin entra no PATH só se faltar, e no fim: não pode passar na frente de outro claude (ex.: o do nexus)
[ "$(PATH="/opt/nexus/bin:$HOME/.local/bin:/usr/bin" bash -c ". '$raiz/lib/habblaud.sh'; hb_garantir_local_bin; printf %s \"\$PATH\"")" = "/opt/nexus/bin:$HOME/.local/bin:/usr/bin" ] || falha "PATH com ~/.local/bin não deveria mudar"
[ "$(PATH="/opt/nexus/bin:/usr/bin" bash -c ". '$raiz/lib/habblaud.sh'; hb_garantir_local_bin; printf %s \"\$PATH\"")" = "/opt/nexus/bin:/usr/bin:$HOME/.local/bin" ] || falha "~/.local/bin deveria entrar no fim"

printf 'ok: lib/habblaud.sh\n'
