# sandbox

Repo mínimo para testar o workflow `time-de-agentes` de ponta a ponta. Não é um projeto de verdade.

- `tests/` traz os testes de aceite prontos; `src/` começa vazio.
- `spec.md` tem 3 tarefas: 1 e 2 em paralelo, 3 depende de 1. A tarefa 2 (moeda) costuma falhar de primeira
  (o `Intl` usa NBSP e põe o sinal no lugar errado), o que exercita a escada.

Como rodar: copie a pasta para um diretório temporário, `git init` e commit inicial, e siga a etapa 3 em diante
da skill `implementar` com `spec.md` (repo = a cópia; memória = a cópia).
