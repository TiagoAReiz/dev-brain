# <Título da feature>

**Status:** planejada | em implementação | implementada | parcial | proposta
**Data:** AAAA-MM-DD
**Projeto:** <projeto> (`<caminho do repo>`)

## Objetivo
<!-- O que muda para o usuário/sistema, em 2-4 linhas. -->

## Contexto
<!-- O que já existe e importa para esta feature. Links para arquivos. -->

## Decisões
<!-- O que foi decidido no planejamento e por quê. Alternativas descartadas. -->

## Fora de escopo
-

## Padrões a seguir
<!-- Convenções do projeto. Arquivos de referência: "faça como em `src/...`". -->

## Contratos
<!-- Assinaturas, tipos, schemas, rotas, eventos, migrations: nomes exatos. -->

## Gates
<!-- Omita para usar gate-tarefa/gate-onda do CLAUDE.md do repo. {arquivos} = arquivos da tarefa. -->
```yaml
gates:
  tarefa: "<lint/testes só dos arquivos: ... {arquivos}>"
  onda: "<lint + typecheck + suíte completa>"
```

## Tarefas
<!-- P: até 3 arquivos e 5 critérios. Sem arquivos/depende = roda sozinha depois das anteriores. -->
```yaml
- id: 1
  titulo: <vira a mensagem do commit>
  tamanho: P
  arquivos: [<caminho/exato.ext>]
  depende: []
  referencia: <arquivo existente para seguir o padrão>
  aceite:
    - <verificável: comando, comportamento observável, resposta esperada>
```

## QA
<!-- Só com interface. Omita a seção inteira se não houver. -->
```yaml
qa:
  subir: "<comando que sobe o app>"
  url: http://localhost:<porta>
  logado: false
  roteiro:
    - <passo concreto -> resultado esperado>
```

## Como ficou
<!-- Preenchido no fim: desvios do plano, correções, bloqueios e a tabela de métricas. -->
