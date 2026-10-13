#!/usr/bin/env bash
# up.sh [--sem-navegador]: sobe o ambiente. Atualiza o dev-brain, reconstrói o Habblaud se o código mudou,
# liga o escritório e abre no navegador. Rode depois do setup.sh e a cada vez que ligar o PC (se ele não subir sozinho).
set -euo pipefail

DEV_BRAIN_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEV_BRAIN_HOME
# shellcheck source=lib/habblaud.sh
. "$DEV_BRAIN_HOME/lib/habblaud.sh"

etapa() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

navegador=1
for arg in "$@"; do
  case "$arg" in
    --sem-navegador) navegador=0 ;;
    *) echo "uso: $0 [--sem-navegador]" >&2; exit 1 ;;
  esac
done

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ] && ! command -v node >/dev/null 2>&1; then
  set +u
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  set -u
fi
hb_garantir_local_bin

etapa "dev-brain"
if [ -n "$(git -C "$DEV_BRAIN_HOME" status --porcelain)" ]; then
  echo "  há mudanças locais; pulando o pull"
elif git -C "$DEV_BRAIN_HOME" pull -q --ff-only 2>/dev/null; then
  echo "  atualizado ($(git -C "$DEV_BRAIN_HOME" log -1 --format='%h %s'))"
else
  echo "  não consegui dar pull; seguindo com a versão local"
fi
"$DEV_BRAIN_HOME/bootstrap.sh" >/dev/null   # skills/agentes novos que vieram no pull

etapa "Habblaud"
reiniciar=0
if hb_precisa_build; then
  echo "  código mudou: build e mod"
  hb_build
  hb_mod
  reiniciar=1
fi
hb_instalar_servico
[ "$HB_UNIT_MUDOU" = 1 ] && reiniciar=1
if [ "$reiniciar" = 1 ] || ! hb_no_ar; then
  hb_subir
else
  echo "  já estava no ar"
fi
if ! hb_esperar; then
  echo "  o Habblaud não respondeu em $HB_URL; veja: $(hb_log)" >&2
  exit 1
fi
hb_status
[ "$navegador" = 1 ] && hb_abrir

echo ""
echo "  Pronto. Para trabalhar: 'project start'. Para descer: ./down.sh"
