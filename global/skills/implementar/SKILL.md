---
name: implementar
description: Fluxo obrigatório para QUALQUER implementação em projeto (feature, correção, refactor, mudança de código). O agente da sessão planeja junto com o usuário e grava a spec no dev-brain; agentes Haiku implementam e corrigem; o agente da sessão testa; no fim a memória do projeto é atualizada e commitada no dev-brain. Use sempre que o usuário pedir para implementar, criar, adicionar, corrigir ou mudar algo no código, mesmo que pareça pequeno.
---

# Implementar

Divisão de trabalho:
- **Você (agente da sessão):** entende, planeja com o usuário, escreve a spec, delega, testa, revisa e atualiza a memória. **Você não escreve código do projeto.**
- **Agentes Haiku:** implementam e corrigem seguindo a spec.

Se o usuário pedir explicitamente para você mesmo codar, obedeça e pule a delegação.

## 0. Contexto

1. Descubra o projeto pelo `CLAUDE.md` do repo (aponta para `$DEV_BRAIN_HOME/memory/<projeto>/`).
   Sem memória: ofereça `$DEV_BRAIN_HOME/new-project.sh <projeto> <repo>` antes de seguir.
2. Leia `README.md` e `estado-atual.md` da memória. Leia `arquitetura.md`, `decisoes.md`
   e as specs em `specs/` que tocam no assunto.
3. Leia o código relevante o suficiente para planejar com precisão. Se a memória contradisser o código, o código vence: anote a correção para a etapa 6.

## 1. Planejar com o usuário

Converse até o plano estar fechado. Questione o que parecer frágil, proponha alternativas,
confira `decisoes.md` para não repropor algo descartado. Não comece a implementar antes do "ok" do usuário.

## 2. Escrever a spec

Grave `memory/<projeto>/specs/AAAA-MM-DD-<slug>.md` seguindo `spec-template.md` (nesta pasta).
A spec é o **único** briefing do Haiku: ele não viu a conversa. Então ela precisa ser explícita:
- arquivos a criar/alterar, com o que muda em cada um;
- assinaturas, tipos, schemas, rotas, nomes exatos;
- padrões do projeto a seguir, com um arquivo existente de referência ("faça como em `src/x.ts`");
- tarefas numeradas, cada uma com os arquivos que toca;
- critérios de aceite verificáveis e os comandos de teste/build/lint.

Mostre a spec ao usuário (resumo ou link do arquivo) e siga.

## 3. Delegar a implementação

Use a ferramenta Agent com `model: "haiku"` (subagent_type `general-purpose`).

- Tarefas que tocam arquivos diferentes e não dependem uma da outra: um agente por tarefa, em paralelo.
- Tarefas dependentes: em sequência, cada agente recebendo o resultado do anterior.

Prompt do agente (preencha tudo; ele não tem outro contexto):

```
Você vai implementar parte de uma feature no projeto em <caminho do repo>.

Leia primeiro, nesta ordem:
1. <memória>/README.md e <memória>/arquitetura.md (contexto do projeto)
2. <memória>/specs/<spec>.md (o plano; é a fonte de verdade)
3. <arquivos de referência citados na spec>

Sua parte: tarefa(s) <N> da spec. <resumo em 1-2 linhas>
<notas extras que não estão na spec, se houver>

Regras:
- Siga a spec. Se algo nela estiver errado ou impossível, não improvise: pare e explique no relatório.
- Mexa só nos arquivos da sua tarefa. Siga o estilo do código ao redor.
- Rode <comandos de build/teste da spec> antes de terminar.
- Não faça commit, não mexa no dev-brain, não instale dependências fora da spec.

Relatório final: arquivos alterados, o que fez em cada um, resultado dos comandos, pendências ou dúvidas.
```

## 4. Testar (você)

1. Leia o diff inteiro (`git diff`, `git status` para arquivos novos). Compare com a spec.
2. Rode build, lint e testes da spec.
3. Interface: suba o app e use a skill `chrome-windows` (no WSL) ou o Chrome direto para testar o fluxo.
4. Confira cada critério de aceite. Anote falhas com evidência: comando, saída, arquivo:linha, o que era esperado.

## 5. Corrigir

Se algo falhou, mande um **novo** agente Haiku com: caminho da spec, a lista exata de falhas com evidência
e o que precisa mudar. Volte para a etapa 4.

Limite: **3 rodadas com Haiku**. Se ainda falhar, uma rodada com `model: "sonnet"`.
Se ainda falhar, pare e mostre ao usuário o que falta e por quê. Se a falha revelar erro na spec,
corrija a spec (e diga ao usuário) antes da próxima rodada.

## 6. Fechar

Tudo passando:

1. **Memória** em `memory/<projeto>/`:
   - spec: `Status: implementada`, mais a seção "Como ficou" com desvios do plano;
   - `arquitetura.md`: se a estrutura, fluxos ou integrações mudaram;
   - `decisoes.md`: uma entrada por decisão tomada no planejamento (com alternativas descartadas);
   - `estado-atual.md`: sobrescreva com o estado de agora e a data;
   - `roadmap.md`: marque o que foi feito;
   - melhorias percebidas e não feitas: em "Melhorias futuras" do `roadmap.md`, ou numa spec nova com `Status: proposta` se for grande;
   - correções de memória desatualizada anotadas na etapa 0.
2. **Commit no projeto**: `git add` só dos arquivos da feature e commit com mensagem descritiva. Sem push (o `project exit` ou o usuário fazem).
3. **Commit no dev-brain**:
   `git -C "$DEV_BRAIN_HOME" add memory/<projeto> && git -C "$DEV_BRAIN_HOME" commit -m "memory(<projeto>): <feature>" && git -C "$DEV_BRAIN_HOME" push`
4. **Resumo ao usuário**: o que foi feito, resultado dos testes, quantas rodadas de correção, o diff da memória (`git -C "$DEV_BRAIN_HOME" show --stat HEAD` e os trechos relevantes) e as melhorias registradas.
