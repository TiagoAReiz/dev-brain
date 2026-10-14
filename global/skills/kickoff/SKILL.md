---
name: kickoff
description: Preenche a memória de um projeto no dev-brain que ainda está só com os templates (projeto novo ou recém-adicionado). Conversa com o usuário sobre objetivo, stack, arquitetura e roadmap, grava tudo e commita no dev-brain. Use quando o usuário pedir kickoff, quando o project create/start mandar, ou quando a memória do projeto estiver vazia antes de uma implementação.
---

# Kickoff de projeto

Objetivo: deixar a memória do projeto boa o bastante para a skill `implementar` e os agentes Haiku
trabalharem sem precisar perguntar o básico.

## 1. Levantar o que já existe

1. Descubra o projeto pelo `CLAUDE.md` do repo e abra `$DEV_BRAIN_HOME/memory/<projeto>/`.
2. Se o repo já tem código, analise antes de perguntar: stack, estrutura de pastas, pontos de entrada,
   comandos de build/test, integrações, infra (Dockerfile, CI, compose). Chegue na conversa com um rascunho.
3. Se o repo está vazio, comece pelas perguntas.

## 2. Conversar

Cubra, sem virar questionário (agrupe perguntas, proponha respostas quando der):
- **O que é e para quem:** problema, usuários, o que é "pronto".
- **Stack:** linguagem, framework, banco, libs principais. Questione escolhas que parecerem ruins para o objetivo.
- **Arquitetura e infra:** organização do código, onde roda, deploy, ambientes, serviços externos.
- **Credenciais:** quais existem e **onde** ficam (nunca o valor).
- **Roadmap:** marcos até o "pronto", em ordem; o primeiro deve ser pequeno.
- **Convenções:** padrões de código, testes, commits, qualquer coisa que os agentes devam seguir.

## 3. Gravar

Na memória do projeto:
- `README.md`: resumo de ~10 linhas (o que é, stack, repo, status).
- `arquitetura.md`: infra, organização do código, fluxos principais, integrações e onde ficam as credenciais.
- `decisoes.md`: uma entrada por escolha relevante (stack, banco, hospedagem...), com alternativas descartadas.
- `roadmap.md`: marcos em checklist; ideias não prioritárias em "Melhorias futuras".
- `estado-atual.md`: data de hoje, "em andamento" vazio, próximo passo = primeiro marco.
- `$DEV_BRAIN_HOME/memory/README.md`: troque o `_descreva em 1 linha_` do projeto pela descrição.

No repo do projeto, preencha a seção "Específico deste projeto" do `CLAUDE.md` com comandos de
build/test/lint e convenções (se já souber). Commit no projeto só desse arquivo, sem push.

## 4. Fechar

1. Commit no dev-brain:
   `git -C "$DEV_BRAIN_HOME/memory" add -A && git -C "$DEV_BRAIN_HOME/memory" commit -m "memory(<projeto>): kickoff" && git -C "$DEV_BRAIN_HOME/memory" push` (a memória é um repo privado à parte; se `memory/.git` não existir, só grave os arquivos e avise)
2. Resuma o que ficou registrado e diga que as features seguem pela skill `implementar`,
   começando pelo primeiro marco do roadmap se o usuário quiser.
