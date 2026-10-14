---
name: delegar-codex
description: Ferramenta para delegar uma tarefa independente e bem especificada a um agente do Codex (outra assinatura), para distribuir carga entre as contas. Use quando o trabalho for longo ou volumoso (pesquisa em código, análise, revisão de diff, geração de testes, refactor mecânico) e pode rodar sem o contexto da conversa, ou quando a sua assinatura do Claude estiver apertada. Não use para decisão de arquitetura, tarefa que depende da conversa, edição nos mesmos arquivos que você está mexendo ou qualquer coisa com segredo.
---

# Delegar para o Codex

Você pode mandar uma tarefa para um agente do Codex pelo comando `codex-agente`. O Codex roda com a outra assinatura,
então você divide o trabalho entre as duas. O comando roda `codex exec` de forma não interativa, num repo, com um prompt,
e devolve um JSON curto com o resultado.

## 1. Quando delegar

**Delegue** quando:
- a tarefa é independente e bem especificada, e não precisa do contexto da conversa;
- o trabalho é longo ou volumoso: pesquisa em código, análise, revisão de diff, geração de testes, refactor mecânico;
- você quer seguir com outra coisa enquanto o Codex trabalha;
- a sua assinatura do Claude está apertada.

**Não delegue** quando:
- é decisão de arquitetura ou de produto: isso fica com você e com o usuário;
- a tarefa depende do que foi conversado e você não consegue descrevê-la por escrito inteira;
- o Codex precisaria mexer nos mesmos arquivos que você está editando agora;
- envolve segredo ou credencial de qualquer tipo.

## 2. Como chamar

Formato geral: `codex-agente [opções] [--] [prompt]`. Se o prompt for omitido ou for `-`, ele é lido do stdin.
O stdout é sempre **uma** linha de JSON; diagnóstico vai para o stderr.

Opções:
- `--repo <dir>`: pasta de trabalho do Codex (padrão: a pasta atual).
- `--escrever`: libera escrita (sandbox `workspace-write`, só dentro do repo). Sem essa flag, o Codex só lê (`read-only`, padrão).
  Exige que o repo seja git.
- `--timeout <segundos>`: inteiro de 1 a 7200 (padrão 900).
- `--modelo <nome>`: repassa o modelo ao Codex (`-m`).
- `--codex-home <dir>`: escolhe a conta do Codex. Define `CODEX_HOME` só para o processo filho (padrão: o ambiente atual).
- `--ajuda`: mostra a ajuda.

**Só leitura (padrão)** — análise, pesquisa, revisão de diff:

```bash
codex-agente --repo /home/tiago/projetos/meu-app <<'PROMPT'
Objetivo: listar todos os lugares em src/ que chamam a função `enviarEmail`
e dizer, para cada um, se o erro dela é tratado.
Arquivos: src/ (só leitura).
Restrições: não altere nenhum arquivo. Não rode comandos que mudem o estado.
Pronto quando: lista com arquivo:linha e uma frase por ocorrência.
Não faça: não commite, não dê push.
PROMPT
```

**Com escrita** — refactor mecânico, geração de testes. Só em repo git com a árvore limpa nos arquivos envolvidos:

```bash
codex-agente --repo /home/tiago/projetos/meu-app --escrever --timeout 1800 --codex-home ~/.codex-conta2 <<'PROMPT'
Objetivo: trocar `console.log` por `logger.info` nos arquivos de src/services/.
Arquivos permitidos: src/services/*.ts. Nenhum outro.
Restrições: não mude assinaturas públicas. Não instale dependências.
Pronto quando: `npm test` passa e não sobra `console.log` em src/services/.
Não faça: não commite, não dê push, não crie arquivos fora de src/services/.
PROMPT
```

**Prompt longo**: sempre por heredoc no stdin (como acima), nunca colado na linha de comando. Assim ele não aparece em `ps`
e não estoura limite de tamanho. Use `<<'PROMPT'` (com aspas) para o shell não expandir `$` nem crases.

**Conta**: use `--codex-home` para escolher a conta do Codex quando houver mais de uma. Sem a flag, vale o `CODEX_HOME`
do ambiente.

**Tarefa longa**: rode pela ferramenta Bash com `run_in_background: true` e continue o seu trabalho. Quando a execução
terminar, você é avisado com a saída. Não fique consultando em loop.

## 3. O prompt precisa ser autocontido

O Codex **não viu a conversa**. Ele só tem o que está no prompt e o que está no repo. Todo prompt precisa dizer:
- **Objetivo:** o que entregar, em uma ou duas frases;
- **Arquivos:** quais ler e, se houver escrita, quais pode alterar (caminhos exatos);
- **Restrições:** o que não mudar, versões, padrões do projeto a seguir (aponte um arquivo de referência);
- **Critério de pronto:** como saber que terminou (comando que deve passar, formato da resposta esperada);
- **O que NÃO fazer:** sempre inclua "não commite e não dê push". Quem commita é você.

Se você não consegue escrever esses cinco itens, a tarefa ainda não está pronta para delegar.

## 4. Ler o resultado

O comando devolve um JSON assim:

```json
{ "status": "ok", "resumo": "...", "arquivos": ["src/services/mail.ts"], "exit_code": 0, "duracao_s": 84.2, "sandbox": "workspace-write" }
```

| `status` | exit code | Significado | O que fazer |
|---|---|---|---|
| `ok` | 0 | O Codex terminou. `resumo` é a última mensagem dele. | Leia o `resumo`, depois confira o trabalho (passo abaixo). |
| `erro` | 1 | O Codex saiu com erro. `resumo` traz as últimas linhas do stderr. | Leia o erro. Corrija o prompt ou faça você mesmo. Não repita igual. |
| `timeout` | 4 | Passou do `--timeout`. O processo foi encerrado. | Divida a tarefa em pedaços menores ou aumente o timeout (até 7200). Confira se algo ficou pela metade. |
| `indisponivel` | 3 | O executável não roda (ex.: `codex` não instalado ou `CODEX_BIN` errado). | Não é culpa do pedido. Resolva a instalação ou faça a tarefa você mesmo. |
| `uso` | 2 | Opção ou valor inválido (ex.: timeout fora de 1..7200, flag desconhecida, `--escrever` fora de repo git). | Corrija a chamada e rode de novo. |

Quando `status` for `ok`:
- `arquivos` lista o que mudou (só vem com `--escrever`). **Confira com `git diff` antes de aceitar.** Leia o diff inteiro
  dos arquivos listados e procure fuga de escopo, código faltando ou coisa que o prompt proibia.
- Se `arquivos` tiver algo fora do que você pediu, reverta esses arquivos (`git checkout -- <arquivo>`) e avise o usuário.
- Rode os seus gates do projeto sobre o resultado.

**Nunca repasse a saída do Codex ao usuário sem checar.** O `resumo` é a opinião do Codex, não um fato verificado.

## 5. Regras de segurança

- **Nunca passe segredos no prompt**: nem senha, token, chave, `.env`, nem o conteúdo deles. Se a tarefa precisa de segredo, não delegue.
- **`--escrever` só em repo git com a árvore limpa nos arquivos envolvidos.** Antes, rode `git status --porcelain` no repo.
  Se já houver mudança sua ou do usuário nesses arquivos, não delegue a escrita.
- **Nunca dois agentes editando o mesmo arquivo ao mesmo tempo.** Enquanto o Codex escreve em um arquivo, você não mexe nele, e vice-versa.
- **O Codex não commita nem dá push.** Quem faz isso é você, depois de revisar o diff. Diga isso no prompt e confira depois.
- **Escrita tem limite de escopo**: o `--escrever` dá acesso de escrita ao repo indicado, não ao sistema. Ainda assim, limite os arquivos no prompt.
