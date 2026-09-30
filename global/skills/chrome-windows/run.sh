#!/usr/bin/env bash
# run.sh [--model <modelo>] [--timeout <seg>] [--keep-open] <tarefa | ->
# Do WSL, abre o Claude Code do Windows com Claude in Chrome numa janela minimizada,
# espera ele gravar o relatório e imprime o relatório no stdout.
# Tarefa "-" lê do stdin.
set -euo pipefail

MODEL="sonnet"
TIMEOUT=600
KEEP_OPEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --keep-open) KEEP_OPEN=1; shift ;;
    -) TASK="$(cat)"; shift ;;
    -*) echo "opção desconhecida: $1" >&2; exit 2 ;;
    *) TASK="$1"; shift ;;
  esac
done
[ -n "${TASK:-}" ] || { echo "uso: $0 [--model sonnet|opus] [--timeout seg] [--keep-open] <tarefa | ->" >&2; exit 2; }

command -v powershell.exe >/dev/null || { echo "powershell.exe não encontrado (isso é WSL?)" >&2; exit 1; }

winps() { powershell.exe -NoProfile -Command "$1" 2>/dev/null | tr -d '\r'; }

WIN_HOME="$(winps '$env:USERPROFILE')"
CLAUDE_EXE="$(winps '(Get-Command claude -ErrorAction SilentlyContinue).Source')"
[ -n "$CLAUDE_EXE" ] || { echo "claude não instalado no Windows: irm https://claude.ai/install.ps1 | iex" >&2; exit 1; }

WORK_WIN="$WIN_HOME\\.claude-chrome"
WORK="$(wslpath -u "$WORK_WIN")"
mkdir -p "$WORK"

ID="$(date +%Y%m%d-%H%M%S)-$$"
RESULT_WIN="$WORK_WIN\\result-$ID.md"
RESULT="$WORK/result-$ID.md"
TASK_WIN="$WORK_WIN\\task-$ID.md"

cat > "$WORK/task-$ID.md" <<EOF
Você é um agente de teste no navegador (Claude in Chrome), chamado por outro agente que não vê a tela.
Faça a tarefa abaixo sozinho, sem perguntar nada: não há ninguém para responder.

## Tarefa
$TASK

## Regras
- Trabalhe numa aba nova. Não feche nem mexa em abas que já estavam abertas.
- Se travar em login, CAPTCHA ou algo que exija o usuário, pare e registre isso no relatório.
- Não envie formulários com dados reais, não compre nada e não publique nada, a menos que a tarefa peça explicitamente.
- Seja objetivo: o relatório é lido por outro agente.

## Relatório (obrigatório)
Ao terminar (com sucesso ou não), grave com a ferramenta Write o arquivo:
$RESULT_WIN

Formato:
STATUS: ok | falhou | bloqueado
RESUMO: 1-2 linhas
DETALHES:
- o que foi verificado, passo a passo, com o resultado de cada um
- erros de console relevantes, textos exatos de mensagens de erro, URLs finais
EOF

cat > "$WORK/run-$ID.ps1" <<EOF
Set-Location '$WORK_WIN'
& '$CLAUDE_EXE' --chrome --model $MODEL --dangerously-skip-permissions 'Leia a tarefa no arquivo $TASK_WIN e execute tudo que ela pede.'
EOF

PID="$(winps "(Start-Process powershell -PassThru -WindowStyle Minimized -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','$WORK_WIN\\run-$ID.ps1').Id")"

cleanup() {
  [ "$KEEP_OPEN" = 1 ] || taskkill.exe /PID "$PID" /T /F >/dev/null 2>&1 || true
  rm -f "$WORK/task-$ID.md" "$WORK/run-$ID.ps1" "$RESULT"
}
trap cleanup EXIT

deadline=$(( $(date +%s) + TIMEOUT ))
until [ -s "$RESULT" ]; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "STATUS: timeout"
    echo "RESUMO: sem relatório em ${TIMEOUT}s (janela do Windows PID $PID)."
    exit 1
  fi
  sleep 3
done
sleep 1  # deixa a escrita terminar
cat "$RESULT"
