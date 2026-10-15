#!/usr/bin/env bash
# bootstrap.sh: configura uma máquina para usar o dev-brain.
# Idempotente: rodar de novo não altera nada que já esteja certo.
# Nunca lê, grava ou commita segredos.
set -euo pipefail

ENV_DEV_BRAIN_HOME="${DEV_BRAIN_HOME:-}"   # valor exportado no shell, se houver
DEV_BRAIN_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
TS="$(date +%Y%m%d-%H%M%S)"

done_items=()
skipped_items=()
manual_items=()

say() { printf '%s\n' "$*"; }

# --- SO ---------------------------------------------------------------------
case "$(uname -s)" in
  Linux)
    if grep -qi microsoft /proc/version 2>/dev/null; then OS="wsl"; else OS="linux"; fi ;;
  Darwin) OS="macos" ;;
  *)
    say "SO não suportado: $(uname -s). Use Linux, macOS ou WSL." >&2
    say "(No Windows, rode dentro do WSL: symlinks do Git Bash não são confiáveis.)" >&2
    exit 1 ;;
esac
say "SO: $OS | DEV_BRAIN_HOME: $DEV_BRAIN_HOME"

# --- Dependências (só verifica) --------------------------------------------
check_cmd() { # $1=comando  $2=obrigatório|opcional  $3=dica
  if command -v "$1" >/dev/null 2>&1; then
    skipped_items+=("$1 já instalado")
  elif [ "$2" = "obrigatório" ]; then
    manual_items+=("instalar $1 (obrigatório): $3")
  else
    manual_items+=("instalar $1 (opcional): $3")
  fi
}

if [ "$OS" = "macos" ]; then pkg="brew install"; else pkg="sudo apt install"; fi
check_cmd git        obrigatório "$pkg git"
check_cmd gh         obrigatório "https://cli.github.com"
check_cmd node       opcional    "https://nodejs.org (ou nvm/fnm)"
check_cmd python3    opcional    "$pkg python3"
check_cmd shellcheck opcional    "$pkg shellcheck"
check_cmd fzf        opcional    "$pkg fzf (seletor do project start)"
check_cmd claude     opcional    "https://docs.claude.com/claude-code"

if command -v gh >/dev/null 2>&1 && ! gh auth status >/dev/null 2>&1; then
  manual_items+=("login no GitHub: gh auth login")
fi
if command -v git >/dev/null 2>&1; then
  git config --global user.name  >/dev/null || manual_items+=("git config --global user.name \"Seu Nome\"")
  git config --global user.email >/dev/null || manual_items+=("git config --global user.email \"voce@exemplo.com\"")
fi

# --- Symlinks ---------------------------------------------------------------
# link <origem> <destino>: cria o symlink; se já houver outra coisa no destino,
# move para <destino>.bak.<timestamp> antes (nunca apaga).
link() {
  local src="$1" dst="$2" bak
  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    skipped_items+=("link ok: ${dst/#$HOME/\~}")
    return
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    bak="$dst.bak.$TS"
    mv "$dst" "$bak"
    manual_items+=("revisar backup: ${bak/#$HOME/\~} (havia outro arquivo/link no destino)")
  fi
  ln -s "$src" "$dst"
  done_items+=("link criado: ${dst/#$HOME/\~} -> ${src/#$HOME/\~}")
}

link "$DEV_BRAIN_HOME/global/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"

for skill in "$DEV_BRAIN_HOME"/global/skills/*/; do
  [ -f "$skill/SKILL.md" ] || continue
  skill="${skill%/}"
  link "$skill" "$CLAUDE_DIR/skills/$(basename "$skill")"
done

for agent_md in "$DEV_BRAIN_HOME"/global/agents/*.md; do
  [ -f "$agent_md" ] || continue
  link "$agent_md" "$CLAUDE_DIR/agents/$(basename "$agent_md")"
done

# Workflows (scripts do time de agentes): viram o comando /<meta.name> no Claude Code.
for wf in "$DEV_BRAIN_HOME"/global/workflows/*.js; do
  [ -f "$wf" ] || continue
  link "$wf" "$CLAUDE_DIR/workflows/$(basename "$wf")"
done

# Liga os workflows no Claude Code (o mesmo toggle do /config). Só acrescenta a chave se ela não existir:
# nunca sobrescreve um valor que a pessoa já escolheu, nem mexe no resto do settings.json.
settings="$CLAUDE_DIR/settings.json"
if [ ! -s "$settings" ]; then
  mkdir -p "$CLAUDE_DIR"
  printf '{\n  "enableWorkflows": true\n}\n' > "$settings"
  done_items+=("criado: ${settings/#$HOME/\~} com enableWorkflows")
elif jq -e 'has("enableWorkflows")' "$settings" >/dev/null 2>&1; then
  skipped_items+=("enableWorkflows já definido em ${settings/#$HOME/\~}")
elif command -v jq >/dev/null 2>&1 && jq -e . "$settings" >/dev/null 2>&1; then
  jq '. + {enableWorkflows: true}' "$settings" > "$settings.tmp.$$" && mv "$settings.tmp.$$" "$settings"
  done_items+=("enableWorkflows ligado em ${settings/#$HOME/\~}")
else
  manual_items+=("ligar workflows: /config > Dynamic workflows (ou \"enableWorkflows\": true no settings.json)")
fi

# Instruções só desta máquina, importadas pelo global/CLAUDE.md. Criado uma vez; nunca sobrescrito.
maquina="$CLAUDE_DIR/CLAUDE.maquina.md"
if [ -e "$maquina" ]; then
  skipped_items+=("já existe: ${maquina/#$HOME/\~}")
else
  printf '<!-- Instruções que só valem nesta máquina (fora do git). Ex.: @RTK.md -->\n' > "$maquina"
  done_items+=("criado: ${maquina/#$HOME/\~} (mova para cá o que era só desta máquina)")
fi

for cmd in "$DEV_BRAIN_HOME"/bin/*; do
  [ -f "$cmd" ] && [ -x "$cmd" ] || continue
  link "$cmd" "$HOME/.local/bin/$(basename "$cmd")"
done
# Atalho "Dev Brain" no menu de aplicativos (Linux com área de trabalho): roda o bin/brain.
if [ "$OS" = "linux" ]; then
  desk="$HOME/.local/share/applications/dev-brain.desktop"
  atalho="[Desktop Entry]
Type=Application
Name=Dev Brain
Comment=Sobe o dev-brain e abre o Habblaud
Exec=$DEV_BRAIN_HOME/bin/brain
Icon=$DEV_BRAIN_HOME/habblaud/client/public/assets/brand/icon-192.png
Terminal=false
Categories=Development;"
  if [ "$(cat "$desk" 2>/dev/null)" = "$atalho" ]; then
    skipped_items+=("atalho ok: ${desk/#$HOME/\~}")
  else
    mkdir -p "$(dirname "$desk")"
    printf '%s\n' "$atalho" > "$desk"
    done_items+=("atalho no menu de apps: Dev Brain")
  fi
fi

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) manual_items+=("adicionar ~/.local/bin ao PATH (o install-tools.sh faz isso)") ;;
esac

# --- DEV_BRAIN_HOME ---------------------------------------------------------
if [ "$ENV_DEV_BRAIN_HOME" = "$DEV_BRAIN_HOME" ]; then
  skipped_items+=("DEV_BRAIN_HOME já exportada")
else
  [ -n "$ENV_DEV_BRAIN_HOME" ] && say "Aviso: DEV_BRAIN_HOME=$ENV_DEV_BRAIN_HOME, mas o repo está em $DEV_BRAIN_HOME"
  manual_items+=("adicionar ao ~/.bashrc ou ~/.zshrc: export DEV_BRAIN_HOME=\"${DEV_BRAIN_HOME/#$HOME/\$HOME}\"")
fi

# --- Resumo -----------------------------------------------------------------
print_list() { # $1=título  demais=itens
  local title="$1"; shift
  say ""; say "$title ($#)"
  [ $# -eq 0 ] && { say "  (nada)"; return; }
  for i in "$@"; do say "  - $i"; done
}
print_list "Feito"   ${done_items[@]+"${done_items[@]}"}
print_list "Pulado"  ${skipped_items[@]+"${skipped_items[@]}"}
print_list "Ação manual" ${manual_items[@]+"${manual_items[@]}"}
say ""
say "Credenciais: veja a seção \"O que não é automatizado\" no README."
