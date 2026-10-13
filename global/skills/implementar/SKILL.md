---
name: implementar
description: Fluxo obrigatório para QUALQUER implementação em projeto (feature, correção, refactor, mudança de código). O agente da sessão planeja com o usuário e grava a spec no dev-brain; um time de subagentes (Haiku e Sonnet) implementa em ondas pelo workflow time-de-agentes, com gates, commit por tarefa, revisão e escada; o agente da sessão faz a leitura final e a QA e atualiza a memória. Use sempre que o usuário pedir para implementar, criar, adicionar, corrigir ou mudar algo no código, mesmo que pareça pequeno.
---

# Implementar

Esta skill autoriza o uso da ferramenta **Workflow** com o script `$DEV_BRAIN_HOME/global/workflows/time.js`.

Divisão de trabalho:
- **Você (agente da sessão):** entende, planeja com o usuário, escreve a spec, valida com o `spec-check`, dispara o time,
  faz a leitura final e a QA e fecha a memória. **Você não escreve código do projeto.**
- **Time (workflow `time-de-agentes`):** `dev-rapido` (Haiku) e `dev` (Sonnet) implementam, `gate` roda os comandos,
  `commit` commita por tarefa e `revisor` (Sonnet) revisa cada onda.
- **QA:** `qa-browser` (Sonnet), no fim.

Se o usuário pedir explicitamente para você mesmo codar, obedeça e pule o time.
Mudança trivial (1 arquivo, poucas linhas, sem lógica nova): proponha fazer direto, porque multiagente custa de 3 a 10x mais tokens.

## 0. Contexto

1. Descubra o projeto pelo `CLAUDE.md` do repo (aponta para `$DEV_BRAIN_HOME/memory/<projeto>/`).
   Sem memória: ofereça `$DEV_BRAIN_HOME/new-project.sh <projeto> <repo>` antes de seguir.
2. Leia `README.md` e `estado-atual.md` da memória. Leia `arquitetura.md`, `decisoes.md`
   e as specs em `specs/` que tocam no assunto.
3. Leia o código relevante o suficiente para planejar com precisão. Se a memória contradisser o código, o código vence: anote a correção para a etapa 8.

## 1. Planejar com o usuário

Converse até o plano estar fechado. Questione o que parecer frágil, proponha alternativas,
confira `decisoes.md` para não repropor algo descartado. Não comece antes do "ok" do usuário.

Confira também, antes do "ok":
- **Gates:** comandos de gate de tarefa e de onda (seção "Específico deste projeto" do `CLAUDE.md` do repo, chaves
  `gate-tarefa:` e `gate-onda:`, ou definidos na spec). Sem gate não há autonomia: combine com o usuário.
- **Working tree:** `git -C <repo> status --porcelain` vazio. Mudança alheia pendente: pergunte o que fazer com ela.

**Depois do "ok", o time roda sozinho até o resumo final.** Não pergunte nada no caminho, salvo os limites da etapa 7.

## 2. Escrever a spec

Grave `memory/<projeto>/specs/AAAA-MM-DD-<slug>.md` seguindo `spec-template.md` (nesta pasta).
A spec é o **único** briefing do time: ninguém viu a conversa. Precisa ser explícita:
- contratos com nomes exatos (assinaturas, tipos, schemas, rotas, migrations);
- padrões do projeto com arquivo de referência;
- bloco `gates` (se não usar os do `CLAUDE.md`) e bloco `qa` quando houver interface.

Tarefas (bloco YAML):
- Corte por **fronteira de contexto** (o que cada tarefa precisa saber para trabalhar sozinha), não por camada nem por fase.
- `tamanho: P` para tarefa mecânica e bem especificada: **no máximo 3 arquivos e 5 critérios**. Maior que isso: divida ou marque `M`.
- `arquivos`: caminhos exatos, sem glob. `depende`: ids. Dúvida sobre algum dos dois? Omita: a tarefa roda sozinha (mais lenta, mas segura).
- `aceite`: critérios verificáveis por comando ou comportamento observável.
- Testes de aceite escritos antes (TDD) entram como tarefa própria ou junto da tarefa que testam, nunca em tarefa paralela que mexe no mesmo arquivo.

## 3. Validar e mostrar

1. Converta os blocos `gates` e `Tarefas` da spec num JSON `{"tarefas": [...], "gates": {...}}`
   (gates da spec; se não houver, os do `CLAUDE.md` do repo) e grave no scratchpad.
2. `spec-check < tarefas.json > args.json`. Erro: corrija a spec e rode de novo.
3. Mostre ao usuário o caminho da spec e as ondas (ex.: `onda 1: 1, 3 · onda 2: 2`) e siga.

## 4. Rodar o time

1. `base` = `git -C <repo> rev-parse HEAD`.
2. Chame a ferramenta Workflow (args como objeto JSON, nunca como string):

```
Workflow({
  scriptPath: "<DEV_BRAIN_HOME absoluto>/global/workflows/time.js",
  args: { ...conteúdo do args.json, repo: "<repo absoluto>", spec: "<spec absoluta>",
          memoria: "<memória absoluta>", base: "<sha>" }
})
```

3. Espere a notificação de fim; não fique consultando. O usuário acompanha pelo `/workflows` e pelo Habblaud.

## 5. Ler o resultado e a leitura final

1. Tarefas `bloqueada` por `spec`: corrija a spec, registre a correção na seção "Como ficou" e rode o time de novo
   **só** com as bloqueadas e as puladas (novo `spec-check` com elas). **1 ciclo.**
2. Bloqueadas por `escada`, `revisao`, `gate_onda` ou `commit`: vão para o resumo.
3. Leitura final: `git -C <repo> diff <base>..HEAD`, **uma vez**. Procure o que a revisão por onda não vê: coerência
   entre ondas, contrato back/front, fuga de escopo, segredo no código, pendências que o workflow registrou.
   Achou algo: acrescente à spec uma seção `## Correção N` com tarefas no mesmo formato (ids continuando a numeração),
   `spec-check` e rode o time com elas. **1 ciclo.**

## 6. QA (se a spec tiver bloco `qa`)

1. Suba o app em background com o comando `qa.subir` e espere a `qa.url` responder (`curl -sf`, até 2 min).
2. Chame o subagente `qa-browser` (ferramenta Agent, `subagent_type: "qa-browser"`) com a URL, o roteiro, `logado`
   e uma pasta de screenshots no scratchpad.
3. `falhou`: escreva uma `## Correção N` a partir dos passos que falharam, rode o time e repita a QA. **Até 2 ciclos.**
   `bloqueado`: vai para o resumo (o usuário resolve login/navegador).
4. Derrube o app no fim.

## 7. Limites

Estourou qualquer limite (ciclos acima, ou nada mais a fazer com tarefas bloqueadas): pare e mostre ao usuário o que
falta, com evidência (tarefa, motivo, pendências, saída do gate). Não tente de novo por conta própria.

## 8. Fechar

1. **Memória** em `memory/<projeto>/`:
   - spec: `Status: implementada` (ou `parcial`), mais "Como ficou": desvios do plano, correções, bloqueios e a
     **tabela de métricas** gerada do retorno do workflow:

     | Tarefa | Tam. | Status | Modelos | Tentativas | Revisões |
     |---|---|---|---|---|---|
     | 1 | P | ok | haiku, haiku | 2 | 1 |

   - `arquitetura.md`, `decisoes.md`, `estado-atual.md`, `roadmap.md`, melhorias e correções de memória como antes.
2. **Projeto:** os commits já foram feitos pelo time, um por tarefa. Sem push (o `project exit` ou o usuário fazem).
3. **dev-brain:** `git -C "$DEV_BRAIN_HOME" add memory/<projeto> && git -C "$DEV_BRAIN_HOME" commit -m "memory(<projeto>): <feature>" && git -C "$DEV_BRAIN_HOME" push`
4. **Resumo ao usuário:** status por tarefa, a tabela de métricas, resultado da QA, o que ficou bloqueado e por quê,
   e o diff da memória (`git -C "$DEV_BRAIN_HOME" show --stat HEAD` e os trechos relevantes).
