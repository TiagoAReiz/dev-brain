#!/usr/bin/env bash
# testar.sh <src/x.js>...: checa a sintaxe de cada arquivo e roda tests/x.test.js, se existir.
# Arquivo que ainda não existe (tarefa de onda futura ou glob sem match) é ignorado.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
testes=()
for f in "$@"; do
  [ -f "$f" ] || continue
  node --check "$f"
  t="tests/$(basename "$f" .js).test.js"
  [ -f "$t" ] && testes+=("$t")
done
[ ${#testes[@]} -eq 0 ] && { echo "nada para testar"; exit 0; }
node --test "${testes[@]}"
