# Time de agentes: desenho

**Status:** proposta
**Data:** 2026-10-13
**Escopo:** fluxo de implementação do dev-brain (skill `implementar`), subagentes, Workflow e base mínima para rodar neste PC.

## Objetivo

Trocar o fluxo atual (Opus planeja, despacha Haiku, lê todo diff, testa e coordena cada rodada de correção na própria
conversa) por um **time**: o Opus planeja e controla a qualidade; agentes baratos implementam em ondas paralelas;
gates determinísticos e um revisor Sonnet filtram o resultado antes de ele chegar ao Opus.

Critérios de sucesso:
- o Opus não acompanha rodada por rodada: recebe um resultado estruturado e lê o diff consolidado **uma vez**;
- o Haiku volta a ser o executor padrão das tarefas pequenas (hoje as specs recentes do `poc-app-maker` foram feitas por Sonnet/Opus);
- cada execução gera métricas (modelos, tentativas, revisões) para calibrar o tamanho das tarefas;
- o usuário acompanha o time pelo `/workflows` e pelo Habblaud, sem precisar aprovar etapas.

## Decisões

| Tema | Decisão | Alternativas descartadas |
|---|---|---|
| Autonomia | Depois da spec aprovada, roda até o fim; chama o usuário só ao estourar limites e no resumo | parar entre ondas; parar antes da QA |
| Revisão | Sonnet revisa **por onda** contra a spec; Opus faz uma leitura final | Haiku revisando Haiku; sem revisor intermediário |
| Escada | Adaptativa por tamanho. **P:** Haiku → Haiku → Sonnet → bloqueia. **M:** Sonnet → Sonnet → bloqueia. Opus nunca coda | escada fixa curta; Opus como último recurso |
| QA de interface | Papel `qa-browser`: WSL → skill `chrome-windows`; Linux/macOS nativo → Claude in Chrome | `agent-browser` headless como padrão |
| Orquestração | Híbrido: Opus planeja e fecha; **Workflow** executa ondas, gates, revisão e escada | tudo no Workflow (QA via MCP incerta); skill + Agent em prosa; CLI própria com `claude -p` |
| Paralelismo | Regra de ondas do vibe-coding-toolkit: mesma onda só com `arquivos` disjuntos e sem dependência; devs não commitam | worktree por agente como padrão (caro; fica como exceção futura) |
| Lógica determinística | Fora do script, em `bin/spec-check` (Node, testável); o Workflow só executa as ondas recebidas | lógica dentro do `time.js` (scripts de Workflow não importam módulos nem acessam disco) |
| Permissões | Fora deste escopo; spec separada | trocar o bypass agora |

## Componentes

```
global/agents/                  -> symlink em ~/.claude/agents/<nome>.md
  dev-rapido.md    haiku    implementa tarefa P
  dev.md           sonnet   implementa tarefa M; 3º degrau do P; correção do gate de onda
  gate.md          haiku    roda comandos de gate; devolve exit code e cauda da saída, sem opinar
  revisor.md       sonnet   revisa a onda contra a spec; veredito estruturado por tarefa
  (commit: sem agente; script determinístico no time.js, ver Validação)
  qa-browser.md    sonnet   executa o roteiro de QA no navegador certo para o ambiente
global/workflows/time.js        Workflow: ondas -> dev -> gate -> commit -> revisão -> escada
bin/spec-check                  valida tarefas/gates e calcula as ondas (stdin JSON -> stdout JSON)
global/skills/implementar/      SKILL.md reescrita; spec-template.md com blocos YAML
bootstrap.sh                    passa a linkar global/agents/*.md
install-tools.sh                suporte a fish (~/.config/fish/conf.d/dev-brain.fish)
exemplos/sandbox/               repo TS mínimo + spec de teste de ponta a ponta
```

Papéis:
- **Opus (sessão):** conversa, escreve a spec, roda `spec-check`, dispara o Workflow, lê o resultado e o diff consolidado,
  dispara a QA, fecha a memória. Não escreve código do projeto (salvo pedido explícito do usuário, como hoje).
- **Workflow:** todo o vai-e-volta barato. Nada da saída dos subagentes passa pelo contexto do Opus, só o JSON final.
- **Habblaud / `/workflows`:** visibilidade. Nenhuma integração específica é necessária: subagentes já aparecem.

## Formato da spec

A spec segue em markdown (Objetivo, Contexto, Decisões, Fora de escopo, Padrões, Contratos, Como ficou).
Três seções passam a ter um bloco YAML.

### Gates

```yaml
gates:
  tarefa: "npm run lint -- {arquivos} && npx vitest related {arquivos} --run"
  onda:   "npm run lint && npm run typecheck && npm test"
```

- `{arquivos}` é substituído pelos arquivos da tarefa (separados por espaço), para o gate de tarefa não pegar código pela metade de tarefas paralelas.
- Sem bloco `gates` na spec, valem os comandos da seção "Específico deste projeto" do `CLAUDE.md` do repo, que passa a ter as chaves `gate-tarefa:` e `gate-onda:`.
- Sem nenhum dos dois, o Opus pergunta antes de disparar: sem gate não há autonomia.

### Tarefas

```yaml
- id: 1
  titulo: Rota POST /apps/:id/publish
  tamanho: P
  arquivos: [api/routes/publish.py, api/tests/test_publish.py]
  depende: []
  referencia: api/routes/apps.py
  aceite:
    - POST sem auth retorna 401
    - publicar app inexistente retorna 404
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `id` | sim | inteiro único |
| `titulo` | sim | vira a mensagem do commit |
| `tamanho` | sim | `P` (≤ 3 arquivos, ≤ 5 critérios) ou `M`; P acima do limite é erro do `spec-check` |
| `arquivos` | não* | caminhos exatos (sem glob) que a tarefa cria ou altera |
| `depende` | não* | ids de tarefas anteriores |
| `referencia` | não | arquivo existente para seguir o padrão |
| `aceite` | sim | ao menos 1 critério verificável |

\* Fail-safe: tarefa sem `arquivos` ou sem `depende` é tratada como dependente de **todas** as anteriores e roda sozinha numa onda.

### QA (opcional)

```yaml
qa:
  subir: "npm run dev"
  url: http://localhost:3000
  logado: false
  roteiro:
    - Entrar no studio, clicar em Publicar no app "demo" -> toast "Publicado" e o link abre o app
```

`logado: true` exige o Chrome real do usuário (já é o padrão neste PC; no WSL, `chrome-windows`).

## `bin/spec-check`

Entrada (stdin): `{"tarefas": [...], "gates": {...}}`. Saída (stdout, exit 0):
`{"tarefas": [...normalizadas...], "gates": {...}, "ondas": [[1, 3], [2], [4]]}`.
Erro (exit 1, stderr): lista de problemas, um por linha.

Validações: campos obrigatórios e tipos; ids únicos; `depende` só aponta para ids existentes; sem ciclos; limite do P;
`gates.tarefa` e `gates.onda` presentes.

Cálculo de ondas (guloso, em ordem de id): uma tarefa entra na primeira onda posterior à de todas as suas dependências
(transitivas) em que seus `arquivos` não colidam com os de nenhuma tarefa já na onda. Tarefa do fail-safe: onda nova
depois da última onda existente, sozinha, e a seguinte começa outra onda nova.

## Workflow `time.js`

`args`: saída do `spec-check` mais `{repo, spec, memoria, base}` (`base` = SHA do HEAD antes de começar).

Por onda, em ordem:

1. **Implementação** — `pipeline` sobre as tarefas da onda; por tarefa, a escada:
   - degraus: P = `[dev-rapido, dev-rapido, dev]`, M = `[dev, dev]`;
   - cada degrau: agente dev (prompt: repo, caminho da spec e da memória, id da tarefa, falhas anteriores com evidência) → agente `gate` com o gate de tarefa;
   - gate ok → tarefa pronta; falhou → próximo degrau levando a saída do gate; sem degraus → `bloqueada` (`motivo: escada`);
   - dev devolve `status: spec_invalida` → `bloqueada` na hora, sem gastar degrau (`motivo: spec`).
2. **Barreira**; tarefas cujas dependências bloquearam viram `pulada`.
3. **Gate da onda** (agente `gate`). Falhou → 1 correção com `dev` olhando a onda inteira → gate de novo → falhou de novo: onda `bloqueada`, ondas seguintes não rodam.
4. **Commit** — script montado pelo `time.js` e executado pelo agente `gate` (sem LLM escrevendo a mensagem; falha se o commit sair com atribuição de IA), um commit por tarefa pronta, em ordem de id, `git add` só dos `arquivos` da tarefa (mais arquivos novos que o dev reportou dentro do escopo); mensagem `<titulo> (tarefa <id>)`. Sem push.
5. **Revisão** — agente `revisor` com a spec e `git diff` dos commits da onda; veredito por tarefa `{aprovada, problemas: [{arquivo, linha, evidencia, correcao}]}`.
   Reprovada → volta à escada nos degraus restantes (se não restar nenhum, usa 1 tentativa extra com `dev`) levando os problemas → gate de tarefa → commit `fix: <titulo> (tarefa <id>)` → revisão só dela. Reprovada 2 vezes → `bloqueada` (`motivo: revisao`).

Retorno:

```json
{ "tarefas": [{ "id": 1, "tamanho": "P", "status": "ok|bloqueada|pulada",
                "motivo": null, "modelos": ["haiku", "haiku"], "tentativas": 2,
                "revisoes": 1, "commits": ["a1b2c3d"], "pendencias": [] }],
  "ondas": [{ "n": 1, "tarefas": [1, 3], "gate": "ok|falhou|bloqueada", "correcao_onda": false }] }
```

O script não usa `Date.now()`/`Math.random()` (quebram o resume). Toda chamada de agente leva `label` com o id da tarefa
e o degrau (ex.: `t3 haiku #2`) e `phase` com a onda, para o `/workflows` e o Habblaud ficarem legíveis.

## Depois do Workflow (Opus)

1. Lê o JSON. `bloqueada` por `spec`: corrige a spec, avisa no resumo e roda o Workflow de novo só com as bloqueadas e as puladas (**1 ciclo**). `escada` e `revisao`: vão para o resumo.
2. Leitura final: `git diff <base>..HEAD` uma vez, procurando o que a revisão por onda não vê (coerência entre ondas, contrato back/front, fuga de escopo, segredo no código). Achou algo: mini-spec de correção no mesmo formato → `spec-check` → Workflow (**1 ciclo**).
3. QA, se houver bloco `qa`: sobe o app em background, espera a URL responder, chama `qa-browser`. Resultado:
   `{status, passos: [{passo, ok, evidencia, screenshot}], erros_console}`. Falhou → mini-spec de correção → Workflow → QA (**até 2 ciclos**).
4. Estourou qualquer limite: para e mostra ao usuário o que falta, com evidência.
5. Fecha: memória como hoje (spec implementada, arquitetura, decisões, estado, roadmap, melhorias) + **tabela de métricas** no "Como ficou" gerada do JSON; commit + push no dev-brain; resumo com status por tarefa, métricas, diff da memória e bloqueios. Projeto: commits já feitos, sem push.

## Base mínima incluída

- Instalar o dev-brain neste PC (`~/dev-brain`, `bootstrap.sh`).
- `install-tools.sh`: se o shell for fish, grava `~/.config/fish/conf.d/dev-brain.fish` com `DEV_BRAIN_HOME`, `~/.local/bin` no PATH e o alias do claude (idempotente).
- `bootstrap.sh`: linka `global/agents/*.md` em `~/.claude/agents/`, com o mesmo esquema de backup.

## Fora de escopo

- Trocar `--dangerously-skip-permissions` por allow/deny-lists (spec separada).
- Dashboard próprio por tarefa: só se o Habblaud + `/workflows` se mostrarem insuficientes no piloto.
- ESLint quality gates do toolkit nos projetos TS (item 4 do plano; spec separada).
- Worktree por agente.

## Testes

1. `node --test` do `spec-check`: ondas com arquivos disjuntos e colidentes; dependência transitiva; fail-safe; ciclo; id inexistente; P acima do limite; gates ausentes.
2. `shellcheck` em `bootstrap.sh`, `install-tools.sh`, `bin/*` em shell.
3. Sandbox de ponta a ponta em `exemplos/sandbox/`: repo TS mínimo com spec de 3 tarefas (1 e 2 paralelas, 3 dependente de 1); a tarefa 2 tem um critério que o Haiku tende a errar de primeira, para exercitar a escada. Conferir: JSON de retorno, um commit por tarefa, tabela de métricas, agentes visíveis no `/workflows` e no Habblaud.
4. Piloto: próxima feature real do `poc-app-maker` pelo fluxo novo; comparar rodadas, tarefas resolvidas pelo Haiku e chamadas ao usuário com as specs anteriores.

## Riscos

- **API de Workflow/subagentes mudar:** o `time.js` é pequeno e o `spec-check` é independente; a skill descreve o fluxo, então dá para cair para Agent em prosa.
- **Gate de tarefa pegar código de tarefa paralela:** mitigado pelo `{arquivos}`; o gate de onda pega o resto.
- **Tarefa P mal estimada:** aparece na métrica (P que subiu para Sonnet); o limite de tamanho no `spec-check` reduz.
- **QA no Chrome real competir com o uso do usuário:** a QA roda uma vez, no fim, e não em paralelo.

## Validação (2026-10-13)

E2E no `exemplos/sandbox` (cópia em diretório temporário), workflow `wf_8e870fe6-999`: 12 agentes, 94 s, ~98 mil tokens de subagentes.

| Tarefa | Tam. | Status | Modelos | Tentativas | Revisões |
|---|---|---|---|---|---|
| 1 slugify | P | ok | haiku | 1 | 1 |
| 2 formatarBRL | P | ok | haiku | 1 | 1 |
| 3 urlProduto | P | ok | haiku | 1 | 1 |

- Ondas: `[1, 2]` e `[3]`; gate de onda ok nas duas, sem correção de onda.
- Commits: `4d1d701 slugify (tarefa 1)`, `160aced formatarBRL (tarefa 2)`, `b5a6211 urlProduto (tarefa 3)`; autor único, sem atribuição de IA; working tree limpo; 11/11 testes de aceite.
- Escada: não foi exercitada no e2e (o Haiku acertou a moeda de primeira, evitando o `Intl`). Escada, spec inválida, revisão
  reprovada, gate de onda bloqueado e exceção de agente são cobertos pelo simulador `tests/workflow-sim.test.cjs`.
- Habblaud: lê `subagents/workflows/<runId>/` e mostra os subagentes do workflow no escritório.
- Ajustes feitos durante a validação:
  - a 1ª execução falhou com `agent type 'gate' not found` (agentes instalados com a sessão já aberta; o registro recarregou depois sozinho);
  - isso revelou dois bugs, corrigidos: exceção de agente dentro do pipeline deixava a tarefa `pendente` (tratada como pronta) e exceção no gate derrubava o workflow. Agora vira `bloqueada` com motivo `erro`;
  - Habblaud em modo Node (systemd do usuário) no Linux nativo, porque o container (UID 1000) não lê `~/.claude` com permissão 700.

### Demonstração (2026-10-13): commit vira script determinístico

Execução com 4 tarefas (ondas `[1, 2, 4]` e `[3]`, 14 agentes, 97 s): as 4 tarefas `ok` com Haiku de primeira e 17/17 testes,
mas o commit da tarefa 3 saiu com `Co-Authored-By: Claude Haiku`. O agente `commit` (LLM) seguiu a instrução de
atribuição do harness e ignorou a do `commit.md`. Correção: o agente `commit` foi removido. O `time.js` monta o script
de commit (arquivos entre aspas, mensagem em heredoc com aspas, falha com exit 3 se o commit tiver `co-authored-by` ou
`generated with`), codifica em base64 e o agente `gate` só executa `echo … | base64 -d | bash`. O `spec-check` passou a
rejeitar título com quebra de linha. Coberto por `tests/workflow-sim.test.cjs`, incluindo um teste que roda o script num repo git real.
