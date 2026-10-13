#!/usr/bin/env bash
# setup.sh [--sem-ferramentas]: configura um PC novo com o dev-brain inteiro. Idempotente: pode rodar de novo.
#   1. ferramentas (install-tools.sh: apt com sudo, nvm/node, Claude Code, bash/fish)
#   2. login no GitHub e git config
#   3. links (bootstrap.sh: CLAUDE.md, skills, agentes, bins)
#   4. Habblaud: build, serviço e mod no Claude Code
# --sem-ferramentas pula o passo 1 (máquina que já tem tudo instalado).
set -euo pipefail

DEV_BRAIN_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEV_BRAIN_HOME
# shellcheck source=lib/habblaud.sh
. "$DEV_BRAIN_HOME/lib/habblaud.sh"

etapa() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
manual=()

ferramentas=1
for arg in "$@"; do
  case "$arg" in
    --sem-ferramentas) ferramentas=0 ;;
    *) echo "uso: $0 [--sem-ferramentas]" >&2; exit 1 ;;
  esac
done

etapa "1/4 Ferramentas"
if [ "$ferramentas" = 0 ]; then
  echo "  pulado (--sem-ferramentas)"
elif command -v apt-get >/dev/null 2>&1; then
  "$DEV_BRAIN_HOME/install-tools.sh" all
else
  echo "  sem apt: instale na mão git, gh, node 22+, fzf e o Claude Code (https://claude.ai/install.sh)"
fi
# Deixa o node do nvm e o ~/.local/bin visíveis para o resto deste script.
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ] && ! command -v node >/dev/null 2>&1; then
  set +u
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  set -u
fi
export PATH="$HOME/.local/bin:$PATH"
for cmd in git gh node npm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Falta '$cmd'. Instale e rode o setup.sh de novo." >&2; exit 1; }
done

etapa "2/4 GitHub e git"
if gh auth status >/dev/null 2>&1; then
  echo "  gh já logado"
else
  gh auth login
fi
git config --global user.name >/dev/null || manual+=("git config --global user.name \"Seu Nome\" (e rode o setup.sh de novo)")
git config --global user.email >/dev/null || manual+=("git config --global user.email \"voce@exemplo.com\"")
[ -n "$(ls "$HOME"/.ssh/id_* 2>/dev/null)" ] || manual+=("chave SSH: ssh-keygen -t ed25519 e cadastre em github.com/settings/keys (opcional com gh)")

etapa "3/4 Links (bootstrap.sh)"
"$DEV_BRAIN_HOME/bootstrap.sh"

etapa "4/4 Habblaud"
if hb_precisa_build; then hb_build; else echo "  build em dia"; fi
hb_mod
hb_instalar_servico
hb_tem_systemd || manual+=("sem systemd do usuário: o Habblaud sobe pelo up.sh (não liga sozinho no login)")
hb_subir
if hb_esperar; then
  hb_status
else
  manual+=("o Habblaud não respondeu em $HB_URL; veja: $(hb_log)")
fi
command -v claude >/dev/null 2>&1 || manual+=("instalar o Claude Code: curl -fsSL https://claude.ai/install.sh | bash")
manual+=("login no Claude Code: rode 'claude' uma vez (abre o navegador)")
manual+=("abra um terminal novo (ou: source ~/.bashrc) para pegar o PATH, o DEV_BRAIN_HOME e o alias do claude")

etapa "Pronto"
echo "  Dia a dia: ./up.sh para subir, ./down.sh para descer, 'project start' para trabalhar num repo."
if [ ${#manual[@]} -gt 0 ]; then
  echo ""
  echo "  Falta fazer na mão:"
  for m in "${manual[@]}"; do echo "  - $m"; done
fi
