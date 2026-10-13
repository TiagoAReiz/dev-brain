#!/usr/bin/env bash
# down.sh: desce o ambiente. Desliga o Habblaud (até o próximo up.sh) e confere se nada ficou só nesta máquina:
# oferece commitar e enviar a memória do dev-brain e avisa de projetos no workfolder.
set -uo pipefail

DEV_BRAIN_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEV_BRAIN_HOME
# shellcheck source=lib/habblaud.sh
. "$DEV_BRAIN_HOME/lib/habblaud.sh"
WORKFOLDER="${WORKFOLDER:-$HOME/workfolder}"

etapa() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ask() { # $1=pergunta; 0 se a resposta for y. Sem terminal, responde não.
  local reply
  [ -t 0 ] || return 1
  read -rp "  $1 (y/N): " reply
  [[ "${reply,,}" == "y" ]]
}

etapa "Habblaud"
hb_parar
if hb_no_ar; then echo "  ainda respondendo em $HB_URL (rodando fora do serviço?)"; else echo "  desligado"; fi

etapa "dev-brain"
db() { git -C "$DEV_BRAIN_HOME" "$@"; }
if [ -n "$(db status --porcelain -- memory)" ]; then
  db status --short -- memory | sed 's/^/  /'
  if ask "Commitar e enviar essas mudanças de memória?"; then
    db add -- memory && db commit -q -m "memory: sessão de $(date +%Y-%m-%d)" && echo "  memória commitada"
  fi
fi
if [ -n "$(db status --porcelain -- . ':!memory')" ]; then
  echo "  há mudanças fora de memory/ (não mexi nelas):"
  db status --short -- . ':!memory' | sed 's/^/    /'
fi
pendentes="$(db log '@{u}..' --oneline 2>/dev/null)"
if [ -n "$pendentes" ]; then
  echo "  commits ainda não enviados:"
  printf '%s\n' "$pendentes" | sed 's/^/    /'
  if ask "Dar push no dev-brain?"; then
    db push -q && echo "  enviado" || echo "  push falhou; rode 'git -C $DEV_BRAIN_HOME push' na mão"
  fi
fi
[ -n "$(db status --porcelain)$(db log '@{u}..' --oneline 2>/dev/null)" ] || echo "  tudo no GitHub"

etapa "Projetos"
shopt -s nullglob
projetos=("$WORKFOLDER"/*/)
if [ ${#projetos[@]} -gt 0 ]; then
  echo "  ainda há ${#projetos[@]} pasta(s) em $WORKFOLDER; para salvar tudo no GitHub e limpar: project exit"
else
  echo "  workfolder vazio"
fi

echo ""
echo "  Desceu. Para subir de novo: ./up.sh"
