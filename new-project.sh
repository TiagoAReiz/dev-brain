#!/usr/bin/env bash
# new-project.sh <nome> [caminho-do-repo-do-projeto]
# Cria memory/<nome>/ a partir dos templates e o CLAUDE.md no repo do projeto.
# Nunca sobrescreve: se algo já existir, aborta sem criar nada.
set -euo pipefail

DEV_BRAIN_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'Erro: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Linux | Darwin) ;;
  *) die "SO não suportado: $(uname -s). Use Linux, macOS ou WSL." ;;
esac

[ $# -ge 1 ] && [ $# -le 2 ] || die "uso: $(basename "$0") <nome> [caminho-do-repo-do-projeto]"

name="$1"
[[ "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] \
  || die "nome inválido '$name': use só minúsculas, números e hífens (ex.: meu-app)."

project_dir="${2:-$PWD}"
[ -d "$project_dir" ] || die "diretório do projeto não existe: $project_dir"
project_dir="$(cd "$project_dir" && pwd)"
[ "$project_dir" != "$DEV_BRAIN_HOME" ] \
  || die "o caminho do projeto é o próprio dev-brain. Passe o caminho do repo do projeto."

mem_dir="$DEV_BRAIN_HOME/memory/$name"
claude_md="$project_dir/CLAUDE.md"
index="$DEV_BRAIN_HOME/memory/README.md"
tpl="$DEV_BRAIN_HOME/templates"

# Checa tudo antes de criar qualquer coisa.
[ ! -e "$mem_dir" ]   || die "já existe: $mem_dir (nada foi alterado)"
[ ! -e "$claude_md" ] || die "já existe: $claude_md (nada foi alterado)"
[ -f "$index" ]       || die "índice não encontrado: $index"

today="$(date +%Y-%m-%d)"
render() { sed -e "s/{{NOME}}/$name/g" -e "s/{{DATA}}/$today/g" "$1" > "$2"; }

# Se algo falhar no meio, desfaz o que foi criado.
created=()
cleanup() { [ ${#created[@]} -eq 0 ] || rm -rf "${created[@]}"; }
trap 'cleanup' ERR

mkdir -p "$mem_dir/specs"
created+=("$mem_dir")
touch "$mem_dir/specs/.gitkeep"
for f in "$tpl"/memory/*.md.tpl; do
  render "$f" "$mem_dir/$(basename "$f" .tpl)"
done

render "$tpl/CLAUDE.md.tpl" "$claude_md"
created+=("$claude_md")

printf -- '- [%s](%s/README.md): _descreva em 1 linha_\n' "$name" "$name" >> "$index"
trap - ERR

git -C "$DEV_BRAIN_HOME" add -- "memory/$name" "memory/README.md"

printf 'Projeto "%s" criado.\n' "$name"
printf '  memória:   %s\n' "$mem_dir"
printf '  CLAUDE.md: %s (não adicionado ao git do projeto)\n\n' "$claude_md"
printf 'Staged no dev-brain (sem commit):\n'
git -C "$DEV_BRAIN_HOME" status --short
printf '\nPróximo: preencha memory/%s/README.md e a linha do índice, depois faça o commit.\n' "$name"
