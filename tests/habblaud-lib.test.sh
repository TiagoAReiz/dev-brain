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

printf 'ok: lib/habblaud.sh\n'
