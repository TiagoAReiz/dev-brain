#!/usr/bin/env bash
# install-tools.sh [system|user|all]: instala as ferramentas de dev no Ubuntu/WSL.
# Idempotente: pula o que já está instalado.
#   system  pacotes apt (precisa de root: sudo ./install-tools.sh system)
#   user    nvm/node, nest cli, claude code, DEV_BRAIN_HOME (como seu usuário, sem sudo)
#   all     os dois (padrão; usa sudo na parte system)
# Diferente do bootstrap.sh, este script INSTALA coisas. Só roda em Ubuntu/Debian.
set -euo pipefail

DEV_BRAIN_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JAVA_DEFAULT=25
NODE_VERSION="--lts"

say() { printf '\n==> %s\n' "$*"; }

command -v apt-get >/dev/null 2>&1 || { echo "Só Ubuntu/Debian (apt)." >&2; exit 1; }

install_system() {
  [ "$(id -u)" -eq 0 ] || { echo "A fase system precisa de root: sudo $0 system" >&2; exit 1; }
  export DEBIAN_FRONTEND=noninteractive

  say "Repositório oficial do GitHub CLI"
  if [ ! -f /etc/apt/sources.list.d/github-cli.list ]; then
    install -d -m 755 /etc/apt/keyrings
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list
  fi

  say "Pacotes apt"
  apt-get update -qq
  apt-get install -y -qq \
    build-essential curl wget ca-certificates gnupg unzip zip jq git gh shellcheck \
    python3 python3-pip python3-venv python-is-python3 pipx \
    openjdk-21-jdk openjdk-25-jdk maven

  say "Java padrão: $JAVA_DEFAULT"
  local jdks jhome
  jdks=(/usr/lib/jvm/java-"$JAVA_DEFAULT"-openjdk-*)
  jhome="${jdks[0]}"
  update-alternatives --set java  "$jhome/bin/java"
  update-alternatives --set javac "$jhome/bin/javac"
}

append_once() { # $1=arquivo  $2=marcador  $3=conteúdo
  grep -qF "$2" "$1" 2>/dev/null || printf '\n%s\n%s\n' "$2" "$3" >> "$1"
}

# shellcheck disable=SC2016  # $HOME/$PATH literais de propósito no ~/.bashrc
install_user() {
  [ "$(id -u)" -ne 0 ] || { echo "A fase user roda como seu usuário, não root." >&2; exit 1; }

  say "nvm + Node $NODE_VERSION (npm e npx vêm junto)"
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null bash
  fi
  set +u  # nvm.sh não é compatível com set -u
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION" >/dev/null
  nvm alias default 'lts/*' >/dev/null
  set -u
  append_once "$HOME/.bashrc" "# nvm" \
'export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"'

  say "Nest CLI"
  command -v nest >/dev/null 2>&1 || npm install -g --silent @nestjs/cli

  say "Claude Code"
  if [ ! -x "$HOME/.local/bin/claude" ]; then
    curl -fsSL https://claude.ai/install.sh | bash
  fi

  say "PATH e DEV_BRAIN_HOME no ~/.bashrc"
  append_once "$HOME/.bashrc" "# local bin" 'export PATH="$HOME/.local/bin:$PATH"'
  append_once "$HOME/.bashrc" "# dev-brain" "export DEV_BRAIN_HOME=\"${DEV_BRAIN_HOME/#$HOME/\$HOME}\""
}

case "${1:-all}" in
  system) install_system ;;
  user)   install_user ;;
  all)    sudo "$0" system; install_user ;;
  *)      echo "uso: $0 [system|user|all]" >&2; exit 1 ;;
esac

say "Pronto. Abra um terminal novo (ou: source ~/.bashrc) e rode ./bootstrap.sh"
