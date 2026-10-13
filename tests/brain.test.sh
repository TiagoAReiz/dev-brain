#!/usr/bin/env bash
# Testa o bin/brain e o atalho do menu sem mexer no serviço de verdade (HOME temporário, sem systemd).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falha() { printf 'FALHOU: %s\n' "$*" >&2; exit 1; }

bash -n "$raiz/bin/brain" || falha "sintaxe do bin/brain"
[ -x "$raiz/bin/brain" ] || falha "bin/brain não é executável"

export HOME="$tmp" HABBLAUD_SEM_SYSTEMD=1 HABBLAUD_PORT=1   # porta 1: nada responde
saida="$("$raiz/bin/brain" ajuda)"
for sub in down status setup; do grep -q "brain $sub" <<<"$saida" || falha "ajuda sem 'brain $sub'"; done
"$raiz/bin/brain" comando-que-nao-existe >/dev/null 2>&1 && falha "subcomando inválido deveria falhar"
grep -q "fora do ar" <<<"$("$raiz/bin/brain" status 2>&1)" || falha "status deveria dizer 'fora do ar'"

# Sem node no PATH, carrega o PATH gravado na unit do serviço.
mkdir -p "$tmp/node/bin" "$tmp/.config/systemd/user"
printf '#!/bin/sh\necho v99\n' > "$tmp/node/bin/node" && chmod +x "$tmp/node/bin/node"
printf '[Service]\nEnvironment="PATH=%s/node/bin:/usr/bin:/bin"\n' "$tmp" > "$tmp/.config/systemd/user/habblaud.service"
achado="$(PATH=/usr/bin:/bin DEV_BRAIN_HOME="$raiz" bash -c ". '$raiz/lib/habblaud.sh'; hb_carregar_ambiente; command -v node")"
[ "$achado" = "$tmp/node/bin/node" ] || falha "hb_carregar_ambiente não achou o node da unit (achou: $achado)"

# Atalho do menu de apps gerado pelo bootstrap.
HOME="$tmp" bash "$raiz/bootstrap.sh" >/dev/null
desk="$tmp/.local/share/applications/dev-brain.desktop"
[ -f "$desk" ] || falha "atalho do menu não criado"
grep -qx "Exec=$raiz/bin/brain" "$desk" || falha "Exec do atalho"
grep -qx "Name=Dev Brain" "$desk" || falha "Name do atalho"
grep -q "^Icon=$raiz/habblaud/client/public/assets/brand/icon-192.png$" "$desk" || falha "Icon do atalho"

printf 'ok: brain\n'
