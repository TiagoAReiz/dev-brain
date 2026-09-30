---
name: chrome-windows
description: Testar ou usar o navegador (Chrome do Windows) a partir do WSL, delegando para o Claude Code do Windows com Claude in Chrome com Sonnet. Use quando precisar abrir uma página, testar uma interface/fluxo em localhost, ler console, conferir visual ou fazer algo em site logado, e o --chrome não estiver disponível (WSL).
---

# Chrome via Claude do Windows

No WSL o `--chrome` não funciona. Esta skill abre o Claude Code do **Windows** (que tem o Chrome conectado)
numa janela minimizada, em bypass de permissões e com Sonnet, passa a tarefa e devolve o relatório.

## Como usar

```bash
~/.claude/skills/chrome-windows/run.sh "Abra http://localhost:3000/login, tente entrar com email inválido e verifique se aparece mensagem de erro. Reporte erros do console."
```

- Rode com timeout alto no Bash (a tarefa leva de 30s a alguns minutos) ou em background.
- O padrão é `sonnet`. `--model opus` para fluxos longos ou em que o Sonnet se perdeu. Não use `haiku`: com ele o Chrome fica pedindo permissão.
- `--timeout <seg>` (padrão 600). `--keep-open` deixa a janela aberta para o usuário ver.
- Tarefa longa: `run.sh - <<'EOF' ... EOF`.

A saída começa com `STATUS: ok | falhou | bloqueado | timeout`.

## Escrevendo a tarefa

O agente do outro lado não sabe nada da conversa. Escreva como um roteiro de QA:
1. **URL exata** (o `localhost` do WSL abre direto no Chrome do Windows).
2. **Passos concretos**: o que clicar, o que digitar.
3. **O que verificar**: textos esperados, estados, erros de console, aparência.
4. **O que reportar**: além do padrão, qualquer dado específico que você precisa.

Uma tarefa por chamada. Não peça para ele corrigir código: ele só testa e relata; você corrige aqui.

## Limites

- Se o relatório vier `bloqueado` (login, CAPTCHA), peça ao usuário para resolver no Chrome e rode de novo.
- Usa as contas logadas do Chrome do usuário: não mande enviar, publicar ou comprar nada sem ele pedir.
- Arquivos temporários ficam em `%USERPROFILE%\.claude-chrome\` e são apagados no fim.
