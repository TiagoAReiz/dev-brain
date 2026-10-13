# Time de agentes: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o fluxo da skill `implementar` por um time de subagentes orquestrado por Workflow (ondas, gates, commit por tarefa, revisão Sonnet e escada), com a base mínima para rodar neste PC e o Habblaud para visibilidade.

**Architecture:** a lógica determinística (validação e cálculo de ondas) fica em `lib/spec-check.cjs`, testada com `node --test` e exposta pelo `bin/spec-check`. O script de Workflow `global/workflows/time.js` só executa as ondas recebidas, chamando os subagentes de `global/agents/`. A skill `implementar` costura tudo: spec → `spec-check` → Workflow → leitura final → QA → memória.

**Tech Stack:** Bash, Node 22+ (sem dependências), Markdown, Claude Code (subagentes, Workflow), Docker (Habblaud).

**Spec:** `docs/specs/2026-10-13-time-de-agentes-design.md`

## Global Constraints

- Node ≥ 22, **zero dependências npm** no dev-brain (só módulos nativos); arquivos Node em CommonJS (`.cjs` ou bin com `require`).
- Scripts shell: `#!/usr/bin/env bash` + `set -euo pipefail`, idempotentes, nunca apagam nem sobrescrevem arquivo do usuário (backup `.bak.<data>` como o `bootstrap.sh` já faz).
- Textos, mensagens e comentários em pt-BR com acentuação correta; identificadores no padrão já usado no repo.
- Commits com **um único autor** e **sem** `Co-Authored-By`, "Generated with" ou qualquer atribuição de IA (regra do `global/CLAUDE.md`).
- Script de Workflow: JavaScript puro, sem `Date.now()`, `Math.random()` nem `new Date()`; começa com `export const meta` literal.
- Modelos: `dev-rapido`, `gate`, `commit` = `haiku`; `dev`, `revisor`, `qa-browser` = `sonnet`.
- Limite de tarefa P: no máximo 3 arquivos e 5 critérios de aceite.
- Escada: P = `dev-rapido → dev-rapido → dev`; M = `dev → dev`; reprovação na revisão sem degrau restante ganha 1 tentativa extra com `dev`; 2 reprovações = bloqueada.
- Limites do Opus: 1 ciclo de correção de spec, 1 ciclo da leitura final, até 2 ciclos de QA.

## Review Focus

1. **Caminho com espaço ou aspas** nos `arquivos`: o gate da tarefa tem que receber cada caminho entre aspas simples, escapado (teste na Tarefa 1).
2. **`depende` apontando para id maior** (tarefas fora de ordem): as ondas seguem a ordem topológica, não a ordem de id (teste na Tarefa 1).
3. **Máquina que já tem `~/.claude/CLAUDE.md` próprio** (caso deste PC, com `@RTK.md`): o bootstrap faz backup, cria `CLAUDE.maquina.md` uma vez só e nunca o sobrescreve (teste na Tarefa 5).
4. **`install-tools.sh shell` rodado duas vezes**: não duplica linhas no `~/.bashrc` e regrava o arquivo do fish igual (teste na Tarefa 6).
5. **Gate de onda rodando antes de todas as tarefas existirem** (ondas posteriores ainda não criaram seus arquivos): o gate do sandbox só testa os `src/*.js` que existem (passo na Tarefa 8).

---

## Estrutura de arquivos

```
lib/spec-check.cjs                 validação + ondas (lógica pura)          [novo]
bin/spec-check                     CLI: stdin JSON -> stdout JSON           [novo]
tests/spec-check.test.cjs          node --test                              [novo]
tests/agents.test.cjs              frontmatter dos subagentes               [novo]
tests/workflow.test.cjs            sintaxe e regras do time.js              [novo]
tests/bootstrap.test.sh            bootstrap com HOME temporário            [novo]
tests/install-shell.test.sh        fase shell do install-tools              [novo]
global/agents/{dev-rapido,dev,gate,commit,revisor,qa-browser}.md            [novos]
global/workflows/time.js           Workflow                                 [novo]
global/skills/implementar/SKILL.md reescrita                                [alterado]
global/skills/implementar/spec-template.md  blocos YAML                     [alterado]
global/CLAUDE.md                   implementação + import da máquina        [alterado]
templates/CLAUDE.md.tpl            chaves gate-tarefa/gate-onda             [alterado]
bootstrap.sh                       agents + CLAUDE.maquina.md               [alterado]
install-tools.sh                   fase shell + fish                        [alterado]
README.md                          estrutura, fluxo, fish, Habblaud         [alterado]
exemplos/sandbox/...               repo de teste de ponta a ponta           [novo]
```

Comando de testes do repo (usado em todas as tarefas): `node --test 'tests/*.test.cjs' && bash tests/bootstrap.test.sh && bash tests/install-shell.test.sh`
(as duas últimas partes só existem a partir das Tarefas 5 e 6).

---

### Tarefa 1: `spec-check` (validação e ondas)

**Files:**
- Create: `lib/spec-check.cjs`
- Create: `bin/spec-check`
- Test: `tests/spec-check.test.cjs`

**Interfaces:**
- Produces: `checar(entrada) -> {ok: true, saida: {tarefas, gates, ondas}} | {ok: false, erros: string[]}`.
  Cada tarefa normalizada: `{id, titulo, tamanho, arquivos: string[], depende: number[], aceite: string[], failsafe: boolean, gate: string, referencia?: string}`, ordenadas por id. `ondas: number[][]`.
- CLI `spec-check`: stdin JSON `{tarefas, gates}` → stdout `saida` (exit 0) ou erros em stderr, um por linha com `- ` (exit 1). JSON inválido → `JSON inválido: ...` (exit 1).

- [ ] **Passo 1: escrever os testes**

`tests/spec-check.test.cjs`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checar } = require('../lib/spec-check.cjs');

const CLI = path.join(__dirname, '..', 'bin', 'spec-check');
const GATES = { tarefa: 'lint {arquivos}', onda: 'test' };
const t = (id, extra = {}) => ({
  id, titulo: `T${id}`, tamanho: 'P', arquivos: [`f${id}.js`], depende: [], aceite: ['ok'], ...extra,
});
const ondas = (tarefas) => {
  const r = checar({ tarefas, gates: GATES });
  assert.ok(r.ok, (r.erros || []).join('\n'));
  return r.saida.ondas;
};
const erros = (entrada) => {
  const r = checar(entrada);
  assert.equal(r.ok, false);
  return r.erros.join('\n');
};

test('tarefas independentes com arquivos disjuntos ficam na mesma onda', () => {
  assert.deepEqual(ondas([t(1), t(2), t(3)]), [[1, 2, 3]]);
});

test('arquivo em comum separa em ondas', () => {
  assert.deepEqual(ondas([t(1), t(2, { arquivos: ['f1.js'] })]), [[1], [2]]);
});

test('dependência vai para a onda seguinte', () => {
  assert.deepEqual(ondas([t(1), t(2, { depende: [1] }), t(3)]), [[1, 3], [2]]);
});

test('dependência transitiva respeita a cadeia', () => {
  assert.deepEqual(
    ondas([t(1), t(2, { depende: [1] }), t(3, { depende: [2] }), t(4)]),
    [[1, 4], [2], [3]],
  );
});

test('dependência para id maior segue a ordem topológica', () => {
  assert.deepEqual(ondas([t(1, { depende: [2] }), t(2)]), [[2], [1]]);
});

test('tarefa sem arquivos roda sozinha e a seguinte abre onda nova', () => {
  assert.deepEqual(ondas([t(1), t(2, { arquivos: undefined }), t(3)]), [[1], [2], [3]]);
});

test('tarefa sem depende vira dependente de todas as anteriores', () => {
  const r = checar({ tarefas: [t(1), t(2), t(3, { depende: undefined })], gates: GATES });
  assert.ok(r.ok);
  assert.deepEqual(r.saida.tarefas[2].depende, [1, 2]);
  assert.equal(r.saida.tarefas[2].failsafe, true);
  assert.deepEqual(r.saida.ondas, [[1, 2], [3]]);
});

test('ciclo é erro', () => {
  assert.match(erros({ tarefas: [t(1, { depende: [2] }), t(2, { depende: [1] })], gates: GATES }), /ciclo/);
});

test('id inexistente em depende é erro', () => {
  assert.match(erros({ tarefas: [t(1, { depende: [9] })], gates: GATES }), /inexistente \(9\)/);
});

test('id repetido é erro', () => {
  assert.match(erros({ tarefas: [t(1), t(1)], gates: GATES }), /repetido/);
});

test('P com mais de 3 arquivos é erro', () => {
  assert.match(erros({ tarefas: [t(1, { arquivos: ['a', 'b', 'c', 'd'] })], gates: GATES }), /no máximo 3 arquivos/);
});

test('P com mais de 5 critérios é erro', () => {
  assert.match(
    erros({ tarefas: [t(1, { aceite: ['1', '2', '3', '4', '5', '6'] })], gates: GATES }),
    /no máximo 5 critérios/,
  );
});

test('M pode ser maior que o limite do P', () => {
  assert.ok(checar({ tarefas: [t(1, { tamanho: 'M', arquivos: ['a', 'b', 'c', 'd'] })], gates: GATES }).ok);
});

test('glob em arquivos é erro', () => {
  assert.match(erros({ tarefas: [t(1, { arquivos: ['src/*.js'] })], gates: GATES }), /glob/);
});

test('gates ausentes são erro', () => {
  const e = erros({ tarefas: [t(1)] });
  assert.match(e, /gates\.tarefa/);
  assert.match(e, /gates\.onda/);
});

test('tarefas vazias são erro', () => {
  assert.match(erros({ tarefas: [], gates: GATES }), /lista vazia/);
});

test('campos obrigatórios faltando são erro', () => {
  const e = erros({ tarefas: [{ id: 1 }], gates: GATES });
  assert.match(e, /titulo/);
  assert.match(e, /tamanho/);
  assert.match(e, /aceite/);
});

test('gate da tarefa recebe os arquivos entre aspas simples', () => {
  const r = checar({ tarefas: [t(1, { arquivos: ['src/a b.js', "src/it's.js"] })], gates: GATES });
  assert.equal(r.saida.tarefas[0].gate, `lint 'src/a b.js' 'src/it'\\''s.js'`);
});

test('gate de tarefa sem arquivos fica sem a lista', () => {
  const r = checar({ tarefas: [t(1, { arquivos: undefined })], gates: GATES });
  assert.equal(r.saida.tarefas[0].gate, 'lint ');
});

test('CLI: sucesso imprime JSON com ondas', () => {
  const r = spawnSync(process.execPath, [CLI], {
    input: JSON.stringify({ tarefas: [t(1)], gates: GATES }), encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).ondas, [[1]]);
});

test('CLI: JSON inválido sai com 1', () => {
  const r = spawnSync(process.execPath, [CLI], { input: '{', encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /JSON inválido/);
});

test('CLI: spec inválida lista os erros e sai com 1', () => {
  const r = spawnSync(process.execPath, [CLI], {
    input: JSON.stringify({ tarefas: [t(1, { depende: [9] })], gates: GATES }), encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^- tarefa 1: depende de id inexistente \(9\)/m);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `node --test 'tests/*.test.cjs'`
Expected: FAIL com `Cannot find module '../lib/spec-check.cjs'`.

- [ ] **Passo 3: implementar `lib/spec-check.cjs`**

```js
'use strict';
// spec-check: valida o bloco de tarefas e gates de uma spec do dev-brain e calcula as ondas.
// Lógica pura; o bin/spec-check só faz I/O.

const LIMITE_P = { arquivos: 3, aceite: 5 };
const GLOB = /[*?[\]{}]/;

const ehTexto = (v) => typeof v === 'string' && v.trim() !== '';

// Aspas simples de shell: it's -> 'it'\''s'
const aspas = (caminho) => `'${caminho.replace(/'/g, "'\\''")}'`;

function validarTarefa(t, i, erros) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    erros.push(`tarefa #${i + 1}: não é um objeto`);
    return;
  }
  const nome = Number.isInteger(t.id) ? `tarefa ${t.id}` : `tarefa #${i + 1}`;
  if (!Number.isInteger(t.id) || t.id < 1) erros.push(`${nome}: id deve ser inteiro positivo`);
  if (!ehTexto(t.titulo)) erros.push(`${nome}: titulo obrigatório`);
  if (t.tamanho !== 'P' && t.tamanho !== 'M') erros.push(`${nome}: tamanho deve ser P ou M`);
  if (!Array.isArray(t.aceite) || t.aceite.length === 0 || !t.aceite.every(ehTexto)) {
    erros.push(`${nome}: aceite precisa de ao menos 1 critério em texto`);
  }
  if (t.arquivos !== undefined) {
    if (!Array.isArray(t.arquivos) || !t.arquivos.every(ehTexto)) {
      erros.push(`${nome}: arquivos deve ser uma lista de caminhos`);
    } else {
      for (const a of t.arquivos) if (GLOB.test(a)) erros.push(`${nome}: arquivo com glob não é permitido (${a})`);
    }
  }
  if (t.depende !== undefined && (!Array.isArray(t.depende) || !t.depende.every(Number.isInteger))) {
    erros.push(`${nome}: depende deve ser uma lista de ids`);
  }
  if (t.referencia !== undefined && !ehTexto(t.referencia)) erros.push(`${nome}: referencia deve ser um caminho`);
  if (t.tamanho === 'P') {
    if (Array.isArray(t.arquivos) && t.arquivos.length > LIMITE_P.arquivos) {
      erros.push(`${nome}: tarefa P toca no máximo ${LIMITE_P.arquivos} arquivos (divida ou marque M)`);
    }
    if (Array.isArray(t.aceite) && t.aceite.length > LIMITE_P.aceite) {
      erros.push(`${nome}: tarefa P tem no máximo ${LIMITE_P.aceite} critérios (divida ou marque M)`);
    }
  }
}

// Fail-safe: sem arquivos ou sem depende, a tarefa depende de todas as de id menor e roda sozinha.
function normalizar(tarefas, gateTarefa) {
  const ordenadas = [...tarefas].sort((a, b) => a.id - b.id);
  return ordenadas.map((t) => {
    const failsafe = !Array.isArray(t.arquivos) || !Array.isArray(t.depende);
    const arquivos = Array.isArray(t.arquivos) ? [...t.arquivos] : [];
    const declaradas = Array.isArray(t.depende) ? t.depende : [];
    const anteriores = failsafe ? ordenadas.filter((o) => o.id < t.id).map((o) => o.id) : [];
    const depende = [...new Set([...anteriores, ...declaradas])].sort((a, b) => a - b);
    const n = {
      id: t.id,
      titulo: t.titulo,
      tamanho: t.tamanho,
      arquivos,
      depende,
      aceite: [...t.aceite],
      failsafe,
      gate: gateTarefa.split('{arquivos}').join(arquivos.map(aspas).join(' ')),
    };
    if (t.referencia) n.referencia = t.referencia;
    return n;
  });
}

// Ordem topológica, menor id primeiro entre as prontas. null se houver ciclo.
function ordenar(tarefas) {
  const pendentes = new Map(tarefas.map((t) => [t.id, new Set(t.depende)]));
  const ordem = [];
  while (pendentes.size) {
    const prontas = [...pendentes].filter(([, deps]) => deps.size === 0).map(([id]) => id);
    if (!prontas.length) return null;
    const id = Math.min(...prontas);
    pendentes.delete(id);
    for (const deps of pendentes.values()) deps.delete(id);
    ordem.push(tarefas.find((t) => t.id === id));
  }
  return ordem;
}

// Guloso: cada tarefa entra na primeira onda depois das suas dependências sem colisão de arquivos.
function calcularOndas(ordem) {
  const ondas = [];
  const ondaDe = new Map();
  let minimo = 0;
  for (const t of ordem) {
    let inicio = minimo;
    for (const d of t.depende) inicio = Math.max(inicio, ondaDe.get(d) + 1);
    let idx = -1;
    if (!t.failsafe) {
      for (let i = inicio; i < ondas.length; i++) {
        if (!ondas[i].fechada && !t.arquivos.some((a) => ondas[i].arquivos.has(a))) {
          idx = i;
          break;
        }
      }
    }
    if (idx === -1) {
      ondas.push({ ids: [], arquivos: new Set(), fechada: t.failsafe });
      idx = ondas.length - 1;
    }
    ondas[idx].ids.push(t.id);
    for (const a of t.arquivos) ondas[idx].arquivos.add(a);
    ondaDe.set(t.id, idx);
    if (t.failsafe) minimo = idx + 1;
  }
  return ondas.map((o) => o.ids);
}

function checar(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { ok: false, erros: ['entrada deve ser um objeto {tarefas, gates}'] };
  }
  const { tarefas, gates } = entrada;
  const erros = [];
  if (!Array.isArray(tarefas) || tarefas.length === 0) erros.push('tarefas: lista vazia ou ausente');
  if (!gates || !ehTexto(gates.tarefa)) erros.push('gates.tarefa: comando obrigatório');
  if (!gates || !ehTexto(gates.onda)) erros.push('gates.onda: comando obrigatório');
  if (Array.isArray(tarefas)) tarefas.forEach((t, i) => validarTarefa(t, i, erros));
  if (erros.length) return { ok: false, erros };

  const ids = new Set();
  for (const t of tarefas) {
    if (ids.has(t.id)) erros.push(`tarefa ${t.id}: id repetido`);
    ids.add(t.id);
  }
  for (const t of tarefas) {
    for (const d of t.depende || []) {
      if (d === t.id) erros.push(`tarefa ${t.id}: depende de si mesma`);
      else if (!ids.has(d)) erros.push(`tarefa ${t.id}: depende de id inexistente (${d})`);
    }
  }
  if (erros.length) return { ok: false, erros };

  const normalizadas = normalizar(tarefas, gates.tarefa);
  const ordem = ordenar(normalizadas);
  if (!ordem) return { ok: false, erros: ['ciclo de dependência entre tarefas'] };
  return {
    ok: true,
    saida: { tarefas: normalizadas, gates: { tarefa: gates.tarefa, onda: gates.onda }, ondas: calcularOndas(ordem) },
  };
}

module.exports = { checar };
```

- [ ] **Passo 4: implementar `bin/spec-check`**

```js
#!/usr/bin/env node
'use strict';
// spec-check: lê {tarefas, gates} em JSON no stdin, valida e imprime as ondas.
// Uso: spec-check < tarefas.json > args.json
const fs = require('node:fs');
const { checar } = require('../lib/spec-check.cjs');

let entrada;
try {
  entrada = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch (e) {
  process.stderr.write(`JSON inválido: ${e.message}\n`);
  process.exit(1);
}
const r = checar(entrada);
if (!r.ok) {
  process.stderr.write(`${r.erros.map((e) => `- ${e}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify(r.saida, null, 2)}\n`);
```

Run: `chmod +x bin/spec-check`

- [ ] **Passo 5: rodar e ver passar**

Run: `node --test 'tests/*.test.cjs'`
Expected: todos os testes `ok`, `fail 0`.

- [ ] **Passo 6: commit**

```bash
git add lib/spec-check.cjs bin/spec-check tests/spec-check.test.cjs
git commit -m "feat: spec-check valida tarefas e calcula ondas"
```

---

### Tarefa 2: subagentes do time

**Files:**
- Create: `global/agents/dev-rapido.md`, `global/agents/dev.md`, `global/agents/gate.md`, `global/agents/commit.md`, `global/agents/revisor.md`, `global/agents/qa-browser.md`
- Test: `tests/agents.test.cjs`

**Interfaces:**
- Produces: tipos de subagente `dev-rapido`, `dev`, `gate`, `commit`, `revisor`, `qa-browser` (nomes usados no `time.js` e na skill). Os formatos de resposta batem com os schemas da Tarefa 3:
  dev `{status: "pronto"|"spec_invalida", arquivos, resumo, motivo?}`; gate `{ok, exit_code, saida}`;
  commit `{commits: [{indice, sha}], erro}`; revisor `{tarefas: [{id, aprovada, problemas: [{arquivo, linha, evidencia, correcao}]}]}`;
  qa-browser `{status, passos: [{passo, ok, evidencia, screenshot}], erros_console}`.

- [ ] **Passo 1: escrever o teste**

`tests/agents.test.cjs`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'global', 'agents');
const ESPERADOS = {
  'dev-rapido': 'haiku', dev: 'sonnet', gate: 'haiku', commit: 'haiku', revisor: 'sonnet', 'qa-browser': 'sonnet',
};

function frontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'sem frontmatter');
  return Object.fromEntries(m[1].split('\n').map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
}

for (const [nome, modelo] of Object.entries(ESPERADOS)) {
  test(`agente ${nome}`, () => {
    const texto = fs.readFileSync(path.join(DIR, `${nome}.md`), 'utf8');
    const fm = frontmatter(texto);
    assert.equal(fm.name, nome);
    assert.equal(fm.model, modelo);
    assert.ok(fm.description && fm.description.length > 20, 'description curta demais');
    assert.ok(texto.split('---\n').slice(2).join('---\n').trim().length > 100, 'corpo vazio');
  });
}

test('nenhum agente sobrando', () => {
  const achados = fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(achados, Object.keys(ESPERADOS).sort());
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `node --test 'tests/*.test.cjs'`
Expected: FAIL em `agente dev-rapido` com `ENOENT`.

- [ ] **Passo 3: criar os agentes**

`global/agents/dev-rapido.md`:

```markdown
---
name: dev-rapido
description: Implementa UMA tarefa pequena (tamanho P) de uma spec do dev-brain. Chamado pelo workflow time-de-agentes; não use fora dele.
model: haiku
tools: Read, Edit, Write, Bash, Grep, Glob
---

Você implementa UMA tarefa de uma spec. O prompt traz: repo, caminho da spec, caminho da memória do projeto,
id e título da tarefa, arquivos permitidos, referência de padrão, critérios de aceite, o gate da tarefa e,
se for o caso, as falhas da tentativa anterior ou os apontamentos do revisor.

Como trabalhar:
1. Leia a spec inteira (é a fonte de verdade), depois `README.md` e `arquitetura.md` da memória e o arquivo de referência.
2. Mexa só nos arquivos permitidos. Precisou de outro arquivo claramente dentro do escopo da tarefa (ex.: um teste novo)? Crie e reporte.
   Nunca mexa em arquivo de outra tarefa.
3. Siga o estilo do código ao redor e os padrões da spec. Não adicione abstração, configuração ou feature que a spec não pediu.
4. Se veio falha anterior, corrija exatamente o que ela aponta antes de qualquer outra coisa.
5. Rode o gate da tarefa (comando no prompt, no diretório do repo) e corrija até passar.

Nunca: commitar, dar push, instalar dependência que a spec não cite, mexer no dev-brain, alterar testes de aceite
que já existiam para fazê-los passar.

Se a spec estiver errada, impossível ou contradizer o código: não improvise. Responda `status: spec_invalida` com o
motivo concreto (o que a spec diz, o que o código mostra, arquivo:linha).

Resposta final: `status` (`pronto` ou `spec_invalida`), `arquivos` (todos os que criou ou alterou, caminhos relativos ao repo),
`resumo` (1 a 3 linhas) e `motivo` quando for `spec_invalida`.
```

`global/agents/dev.md`:

```markdown
---
name: dev
description: Implementa uma tarefa média (tamanho M) de uma spec do dev-brain, é o 3º degrau da escada das tarefas P e corrige falhas do gate de onda. Chamado pelo workflow time-de-agentes.
model: sonnet
tools: Read, Edit, Write, Bash, Grep, Glob
---

Você implementa UMA tarefa de uma spec, ou corrige uma onda cujo gate falhou. O prompt traz: repo, caminho da spec,
caminho da memória do projeto e, conforme o caso, a tarefa (id, título, arquivos permitidos, referência, critérios,
gate da tarefa) ou a falha do gate de onda (tarefas envolvidas, arquivos, comando e saída).

Como trabalhar:
1. Leia a spec inteira (é a fonte de verdade), depois `README.md` e `arquitetura.md` da memória e o arquivo de referência.
2. Mexa só nos arquivos permitidos (na correção de onda: nos arquivos das tarefas listadas). Precisou de outro arquivo
   claramente dentro do escopo? Crie e reporte.
3. Siga o estilo do código ao redor e os padrões da spec. Não adicione abstração, configuração ou feature que a spec não pediu.
4. Se veio falha anterior ou apontamento do revisor, resolva a causa, não o sintoma: leia a saída inteira antes de mexer.
5. Rode o gate informado (no diretório do repo) e corrija até passar.

Nunca: commitar, dar push, instalar dependência que a spec não cite, mexer no dev-brain, alterar testes de aceite
que já existiam para fazê-los passar.

Se a spec estiver errada, impossível ou contradizer o código: não improvise. Responda `status: spec_invalida` com o
motivo concreto (o que a spec diz, o que o código mostra, arquivo:linha).

Resposta final: `status` (`pronto` ou `spec_invalida`), `arquivos` (todos os que criou ou alterou, caminhos relativos ao repo),
`resumo` (1 a 3 linhas) e `motivo` quando for `spec_invalida`.
```

`global/agents/gate.md`:

```markdown
---
name: gate
description: Roda um comando de gate (lint, typecheck, testes) num repo e devolve exit code e saída, sem opinar nem corrigir. Chamado pelo workflow time-de-agentes.
model: haiku
tools: Bash
---

Você é um executor de comandos. O prompt traz um diretório e um comando.

1. Rode o comando exatamente como veio, a partir do diretório: `cd <diretório> && <comando>`, juntando stderr no stdout,
   com timeout de 10 minutos.
2. Não altere arquivos, não instale nada, não tente corrigir, não rode outros comandos além desse.

Resposta final: `ok` (true só se o exit code for 0), `exit_code` (inteiro; use -1 se estourou o timeout)
e `saida` (as últimas 80 linhas da saída, sem resumir nem comentar).
```

`global/agents/commit.md`:

```markdown
---
name: commit
description: Commita, em sequência, uma lista de mudanças num repo (um commit por item, só os arquivos do item). Chamado pelo workflow time-de-agentes.
model: haiku
tools: Bash
---

O prompt traz o caminho do repo e uma lista numerada de commits, cada um com `mensagem` e `arquivos`.

Para cada item, na ordem:
1. `git -C <repo> add -A -- <arquivos do item>` (o `-A` com caminhos inclui arquivos apagados; ignore caminho que não existe nem está no índice).
2. Se nada ficou staged (`git -C <repo> diff --cached --quiet` sai 0), o `sha` desse item é `null`; siga para o próximo.
3. `git -C <repo> commit -m "<mensagem>"`, com a mensagem exatamente como veio.
4. `sha` = `git -C <repo> rev-parse --short HEAD`.

Nunca: `git add` sem caminhos, `git add .`, `--amend`, `--no-verify`, push, rebase, trocar de branch, editar arquivos.
Nunca acrescente coautoria, assinatura ou atribuição de IA na mensagem.

Se um commit falhar (hook, conflito, erro do git): pare, não tente consertar e devolva `erro` com a saída do git.

Resposta final: `commits` (lista de `{indice, sha}` dos itens processados, `indice` começando em 0) e `erro` (`null` se tudo deu certo).
```

`global/agents/revisor.md`:

```markdown
---
name: revisor
description: Revisa os commits de uma onda contra a spec do dev-brain e devolve um veredito por tarefa, com problemas acionáveis. Chamado pelo workflow time-de-agentes.
model: sonnet
tools: Read, Bash, Grep, Glob
---

O prompt traz o repo, a spec, a memória do projeto e as tarefas a revisar, cada uma com seus commits.

1. Leia a spec inteira: objetivo, decisões, padrões, contratos e a tarefa (arquivos, critérios de aceite, referência).
2. Para cada tarefa, leia o diff dos commits dela (`git -C <repo> show <sha>`) e o código ao redor quando precisar.
3. Reprove só por problema real:
   - critério de aceite não atendido ou atendido só no teste (ex.: valor fixo, `sleep` no lugar de espera de verdade);
   - contrato divergente da spec (nome, tipo, rota, schema, status HTTP);
   - fuga de escopo: arquivo de outra tarefa, feature não pedida, dependência nova;
   - padrão do projeto violado de um jeito que importa (o arquivo de referência mostra o certo);
   - bug evidente, tratamento de erro faltando onde a spec pede, segredo no código.
   Não reprove por gosto, estilo ou melhoria opcional.
4. Cada problema: `arquivo`, `linha` (ou `null`), `evidencia` (o que está lá) e `correcao` (o que mudar, concreto o
   bastante para outro agente aplicar sem ler esta revisão inteira).

Não altere arquivos nem rode comandos que mudem o repo.

Resposta final: `tarefas`, uma entrada por tarefa recebida: `{id, aprovada, problemas}` (`problemas` vazio se aprovada).
```

`global/agents/qa-browser.md`:

```markdown
---
name: qa-browser
description: Executa um roteiro de QA de interface num app local e relata cada passo com evidência. No WSL usa a skill chrome-windows; em Linux/macOS nativo usa o Claude in Chrome. Chamado pela skill implementar no fim do fluxo.
model: sonnet
---

O prompt traz a URL, o roteiro (passos com o resultado esperado), se o fluxo precisa de sessão logada e a pasta onde
salvar screenshots.

1. Ambiente: `grep -qi microsoft /proc/version` dá 0 → WSL → use `~/.claude/skills/chrome-windows/run.sh` (leia o
   `SKILL.md` dela antes; mande o roteiro inteiro numa chamada). Senão → Claude in Chrome: carregue as ferramentas
   `mcp__claude-in-chrome__*` com o ToolSearch numa chamada só, chame `tabs_context_mcp`, abra uma aba nova com
   `tabs_create_mcp` e feche no fim. Nunca use abas que já estavam abertas.
2. Sem navegador disponível (extensão desconectada, `run.sh` falhou ao abrir): `status: bloqueado` e explique.
3. Execute cada passo do roteiro. Para cada um: o que fez, o que viu, se bateu com o esperado e um screenshot salvo na pasta indicada.
4. No fim, leia o console da página e registre erros e avisos relevantes.

Só navegue na URL informada e no que ela abrir. Não envie, publique, compre nem apague nada fora do app em teste.
Não dispare `alert`/`confirm`. Não corrija código: só teste e relate.

Resposta final: `status` (`ok`, `falhou` ou `bloqueado`), `passos` (lista de `{passo, ok, evidencia, screenshot}`)
e `erros_console` (lista de textos).
```

- [ ] **Passo 4: rodar e ver passar**

Run: `node --test 'tests/*.test.cjs'`
Expected: `fail 0`.

- [ ] **Passo 5: commit**

```bash
git add global/agents tests/agents.test.cjs
git commit -m "feat: subagentes do time (dev, gate, commit, revisor, qa)"
```

---

### Tarefa 3: Workflow `time.js`

**Files:**
- Create: `global/workflows/time.js`
- Test: `tests/workflow.test.cjs`

**Interfaces:**
- Consumes: `args` = saída do `spec-check` (Tarefa 1) + `{repo, spec, memoria, base}`; tipos de subagente da Tarefa 2.
- Produces: retorno `{tarefas: [{id, tamanho, status, motivo, modelos, tentativas, revisoes, commits, pendencias}], ondas: [{n, tarefas, gate, correcao_onda, gate_pos_revisao?, saida_gate?}]}`.
  `status` ∈ `ok | bloqueada | pulada`; `motivo` ∈ `null | spec | escada | revisao | gate_onda | commit | "depende de N" | "onda N bloqueada"`.

- [ ] **Passo 1: escrever o teste**

`tests/workflow.test.cjs`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'global', 'workflows', 'time.js');
const fonte = () => fs.readFileSync(SCRIPT, 'utf8');

test('time.js tem sintaxe válida de módulo', () => {
  // O Workflow aceita `return` no corpo do script; o Node não. Troca só para checar a sintaxe.
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'time-')), 'time.mjs');
  const corpo = fonte();
  assert.ok(corpo.includes('\nreturn {'), 'o script deve terminar com return {...}');
  fs.writeFileSync(tmp, corpo.replace('\nreturn {', '\nexport default {'));
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('time.js começa com meta literal', () => {
  assert.match(fonte(), /^export const meta = \{\n {2}name: 'time-de-agentes',/);
});

test('time.js não usa relógio nem aleatório', () => {
  assert.doesNotMatch(fonte(), /Date\.now\(|Math\.random\(|new Date\(/);
});

test('todo agentType usado existe em global/agents', () => {
  const tipos = [...fonte().matchAll(/agentType: '([a-z-]+)'/g)].map((m) => m[1]);
  const usados = new Set([...tipos, 'dev-rapido', 'dev']);
  for (const tipo of usados) {
    assert.ok(fs.existsSync(path.join(RAIZ, 'global', 'agents', `${tipo}.md`)), `agente inexistente: ${tipo}`);
  }
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `node --test 'tests/*.test.cjs'`
Expected: FAIL com `ENOENT` em `time.js`.

- [ ] **Passo 3: implementar `global/workflows/time.js`**

```js
export const meta = {
  name: 'time-de-agentes',
  description: 'Implementa as tarefas de uma spec do dev-brain em ondas: dev, gate, commit, revisão e escada',
  whenToUse: 'Chamado pela skill implementar do dev-brain, com a saída do bin/spec-check em args',
}

// args: saída do spec-check ({tarefas, gates, ondas}) + {repo, spec, memoria, base}
const DEGRAUS = { P: ['dev-rapido', 'dev-rapido', 'dev'], M: ['dev', 'dev'] }
const MODELO = { 'dev-rapido': 'haiku', dev: 'sonnet' }
const MAX_REVISOES = 2

const DEV_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pronto', 'spec_invalida'] },
    arquivos: { type: 'array', items: { type: 'string' } },
    resumo: { type: 'string' },
    motivo: { type: 'string' },
  },
  required: ['status', 'arquivos', 'resumo'],
}
const GATE_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, exit_code: { type: 'integer' }, saida: { type: 'string' } },
  required: ['ok', 'exit_code', 'saida'],
}
const COMMIT_SCHEMA = {
  type: 'object',
  properties: {
    commits: {
      type: 'array',
      items: {
        type: 'object',
        properties: { indice: { type: 'integer' }, sha: { type: ['string', 'null'] } },
        required: ['indice', 'sha'],
      },
    },
    erro: { type: ['string', 'null'] },
  },
  required: ['commits', 'erro'],
}
const REVISAO_SCHEMA = {
  type: 'object',
  properties: {
    tarefas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          aprovada: { type: 'boolean' },
          problemas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                arquivo: { type: 'string' },
                linha: { type: ['integer', 'null'] },
                evidencia: { type: 'string' },
                correcao: { type: 'string' },
              },
              required: ['arquivo', 'evidencia', 'correcao'],
            },
          },
        },
        required: ['id', 'aprovada', 'problemas'],
      },
    },
  },
  required: ['tarefas'],
}

const { repo, spec, memoria, tarefas, gates, ondas } = args
const porId = Object.fromEntries(tarefas.map((t) => [t.id, t]))
const estados = Object.fromEntries(tarefas.map((t) => [t.id, {
  id: t.id, tamanho: t.tamanho, status: 'pendente', motivo: null, modelos: [], tentativas: 0,
  revisoes: 0, commits: [], pendencias: [], arquivos: [...t.arquivos], degrau: 0, extra: false,
}]))
const resumoOndas = []

const lista = (xs) => xs.map((x) => `- ${x}`).join('\n')

function bloquear(t, motivo, pendencia) {
  const est = estados[t.id]
  est.status = 'bloqueada'
  est.motivo = motivo
  if (pendencia) est.pendencias.push(pendencia)
}

function promptDev(t, falha) {
  return [
    `Repo: ${repo}`,
    `Spec (fonte de verdade): ${spec}`,
    `Memória do projeto: ${memoria}`,
    `Sua tarefa: ${t.id}. ${t.titulo}`,
    `Arquivos permitidos:\n${lista(t.arquivos.length ? t.arquivos : ['(não declarados: limite-se ao escopo da tarefa)'])}`,
    t.referencia ? `Referência de padrão: ${t.referencia}` : '',
    `Critérios de aceite:\n${lista(t.aceite)}`,
    `Gate da tarefa (rode antes de terminar): ${t.gate}`,
    falha ? `A tentativa anterior falhou. Resolva isto primeiro:\n${falha}` : '',
  ].filter(Boolean).join('\n\n')
}

async function rodarGate(cmd, label, fase) {
  const g = await agent(`Diretório: ${repo}\nComando:\n${cmd}`, {
    agentType: 'gate', model: 'haiku', effort: 'low', schema: GATE_SCHEMA, label, phase: fase,
  })
  return g || { ok: false, exit_code: -1, saida: 'o agente de gate não respondeu' }
}

// Sobe a escada da tarefa até o gate passar. true = passou; false = bloqueada (motivo já gravado).
async function escada(t, fase, falhaInicial, permitirExtra, motivoFalha) {
  const est = estados[t.id]
  let falha = falhaInicial
  for (;;) {
    let tipo
    if (est.degrau < DEGRAUS[t.tamanho].length) {
      tipo = DEGRAUS[t.tamanho][est.degrau]
      est.degrau += 1
    } else if (permitirExtra && !est.extra) {
      est.extra = true
      tipo = 'dev'
    } else {
      bloquear(t, motivoFalha, falha)
      return false
    }
    est.tentativas += 1
    est.modelos.push(MODELO[tipo])
    const r = await agent(promptDev(t, falha), {
      agentType: tipo, model: MODELO[tipo], schema: DEV_SCHEMA,
      label: `t${t.id} ${MODELO[tipo]} #${est.tentativas}`, phase: fase,
    })
    if (!r) {
      falha = 'o agente dev não respondeu'
      continue
    }
    if (r.status === 'spec_invalida') {
      bloquear(t, 'spec', r.motivo || r.resumo)
      return false
    }
    for (const a of r.arquivos) if (!est.arquivos.includes(a)) est.arquivos.push(a)
    const g = await rodarGate(t.gate, `t${t.id} gate #${est.tentativas}`, fase)
    if (g.ok) return true
    falha = `Gate da tarefa falhou (exit ${g.exit_code}):\n${g.saida}`
  }
}

// itens: [{id|null, mensagem, arquivos}]. Devolve null se deu certo, ou o texto do erro.
async function commitar(itens, fase, label) {
  if (!itens.length) return null
  const corpo = itens.map((c, i) => `${i}. mensagem: ${c.mensagem}\n   arquivos: ${c.arquivos.join(' ')}`).join('\n')
  const r = await agent(`Repo: ${repo}\nCommits, nesta ordem:\n${corpo}`, {
    agentType: 'commit', model: 'haiku', effort: 'low', schema: COMMIT_SCHEMA, label, phase: fase,
  })
  if (!r) return 'o agente de commit não respondeu'
  for (const c of r.commits) {
    const item = itens[c.indice]
    if (item && item.id !== null && c.sha) estados[item.id].commits.push(c.sha)
  }
  return r.erro || null
}

async function revisar(ts, fase, rodada) {
  const corpo = ts.map((t) => `- tarefa ${t.id} (${t.titulo}): commits ${estados[t.id].commits.join(' ') || '(nenhum)'}`).join('\n')
  return agent(`Repo: ${repo}\nSpec: ${spec}\nMemória: ${memoria}\nRevise estas tarefas:\n${corpo}`, {
    agentType: 'revisor', model: 'sonnet', schema: REVISAO_SCHEMA, label: `revisão #${rodada}`, phase: fase,
  })
}

const formatarProblemas = (ps) =>
  ps.map((p) => `${p.arquivo}${p.linha ? `:${p.linha}` : ''}: ${p.evidencia} -> ${p.correcao}`).join('\n')

let parar = null
for (let i = 0; i < ondas.length; i++) {
  const n = i + 1
  const fase = `Onda ${n}`
  const info = { n, tarefas: ondas[i], gate: 'pulada', correcao_onda: false }
  resumoOndas.push(info)
  const daOnda = ondas[i].map((id) => porId[id])

  if (parar) {
    for (const t of daOnda) Object.assign(estados[t.id], { status: 'pulada', motivo: parar })
    continue
  }

  // 1. Implementação: escada por tarefa, sem esperar as outras.
  const executaveis = []
  for (const t of daOnda) {
    const dep = t.depende.find((d) => estados[d].status !== 'ok')
    if (dep !== undefined) Object.assign(estados[t.id], { status: 'pulada', motivo: `depende de ${dep}` })
    else executaveis.push(t)
  }
  if (!executaveis.length) {
    log(`${fase}: nada a executar`)
    continue
  }
  log(`${fase}: tarefas ${executaveis.map((t) => t.id).join(', ')}`)
  await pipeline(executaveis, (t) => escada(t, fase, null, false, 'escada'))

  // 2. Barreira: o gate da onda precisa de todas prontas.
  const prontas = executaveis.filter((t) => estados[t.id].status === 'pendente')
  if (!prontas.length) continue

  // 3. Gate da onda, com 1 correção.
  let extrasOnda = []
  let g = await rodarGate(gates.onda, `gate onda ${n}`, fase)
  if (!g.ok) {
    info.correcao_onda = true
    const r = await agent([
      `Repo: ${repo}`,
      `Spec (fonte de verdade): ${spec}`,
      `Memória do projeto: ${memoria}`,
      `O gate da onda falhou depois das tarefas ${prontas.map((t) => t.id).join(', ')}. Corrija sem sair do escopo delas.`,
      `Arquivos das tarefas:\n${lista(prontas.flatMap((t) => estados[t.id].arquivos))}`,
      `Gate da onda (rode antes de terminar): ${gates.onda}`,
      `Saída (exit ${g.exit_code}):\n${g.saida}`,
    ].join('\n\n'), {
      agentType: 'dev', model: 'sonnet', schema: DEV_SCHEMA, label: `correção onda ${n}`, phase: fase,
    })
    if (r && r.status === 'pronto') extrasOnda = r.arquivos
    g = await rodarGate(gates.onda, `gate onda ${n} #2`, fase)
  }
  if (!g.ok) {
    info.gate = 'bloqueada'
    info.saida_gate = g.saida
    for (const t of prontas) bloquear(t, 'gate_onda', `Gate da onda ${n} falhou (exit ${g.exit_code})`)
    parar = `onda ${n} bloqueada`
    continue
  }
  info.gate = 'ok'

  // 4. Commit: um por tarefa; arquivos da correção fora de qualquer tarefa vão num commit próprio.
  const conhecidos = new Set(prontas.flatMap((t) => estados[t.id].arquivos))
  const soltos = extrasOnda.filter((a) => !conhecidos.has(a))
  const itens = prontas.map((t) => ({ id: t.id, mensagem: `${t.titulo} (tarefa ${t.id})`, arquivos: estados[t.id].arquivos }))
  if (soltos.length) itens.push({ id: null, mensagem: `fix: gate da onda ${n}`, arquivos: soltos })
  const erroCommit = await commitar(itens, fase, `commit onda ${n}`)
  if (erroCommit) {
    for (const t of prontas) bloquear(t, 'commit', erroCommit)
    parar = `commit da onda ${n} falhou`
    continue
  }

  // 5. Revisão por onda; reprovadas voltam para a escada.
  let pendentes = prontas
  let houveCorrecao = false
  for (let rodada = 1; rodada <= MAX_REVISOES && pendentes.length; rodada++) {
    const v = await revisar(pendentes, fase, rodada)
    const vereditos = new Map((v ? v.tarefas : []).map((x) => [x.id, x]))
    const reprovadas = []
    for (const t of pendentes) {
      const est = estados[t.id]
      est.revisoes += 1
      const ver = vereditos.get(t.id)
      if (!ver) {
        est.status = 'ok'
        est.pendencias.push('o revisor não devolveu veredito; conferir na leitura final')
      } else if (ver.aprovada) {
        est.status = 'ok'
      } else if (rodada === MAX_REVISOES) {
        bloquear(t, 'revisao', formatarProblemas(ver.problemas))
      } else {
        reprovadas.push({ t, problemas: formatarProblemas(ver.problemas) })
      }
    }
    if (!reprovadas.length) break
    await pipeline(reprovadas, ({ t, problemas }) => escada(t, fase, `O revisor reprovou:\n${problemas}`, true, 'revisao'))
    const corrigidas = reprovadas.map((r) => r.t).filter((t) => estados[t.id].status === 'pendente')
    if (corrigidas.length) {
      houveCorrecao = true
      const erro = await commitar(
        corrigidas.map((t) => ({ id: t.id, mensagem: `fix: ${t.titulo} (tarefa ${t.id})`, arquivos: estados[t.id].arquivos })),
        fase, `commit correções onda ${n}`,
      )
      if (erro) {
        for (const t of corrigidas) bloquear(t, 'commit', erro)
        parar = `commit das correções da onda ${n} falhou`
        break
      }
    }
    pendentes = corrigidas
  }

  // 6. Correções da revisão passam de novo pelo gate da onda.
  if (houveCorrecao && !parar) {
    const g2 = await rodarGate(gates.onda, `gate onda ${n} pós-revisão`, fase)
    info.gate_pos_revisao = g2.ok ? 'ok' : 'falhou'
    if (!g2.ok) {
      info.saida_gate = g2.saida
      parar = `gate da onda ${n} falhou depois das correções da revisão`
    }
  }
}

return {
  tarefas: tarefas.map((t) => {
    const { degrau, extra, arquivos, ...resto } = estados[t.id]
    return resto
  }),
  ondas: resumoOndas,
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `node --test 'tests/*.test.cjs'`
Expected: `fail 0`.

- [ ] **Passo 5: commit**

```bash
git add global/workflows/time.js tests/workflow.test.cjs
git commit -m "feat: workflow time-de-agentes (ondas, gates, commit, revisão e escada)"
```

---

### Tarefa 4: skill `implementar`, template de spec e instruções globais

**Files:**
- Modify: `global/skills/implementar/SKILL.md` (reescrita completa)
- Modify: `global/skills/implementar/spec-template.md` (reescrita completa)
- Modify: `global/CLAUDE.md` (seção "Implementação")
- Modify: `templates/CLAUDE.md.tpl` (seção "Específico deste projeto")
- Modify: `README.md` (seções "Estrutura" e "Implementando")

**Interfaces:**
- Consumes: `spec-check` (Tarefa 1), subagentes (Tarefa 2), `time.js` (Tarefa 3).

- [ ] **Passo 1: reescrever `global/skills/implementar/SKILL.md`**

````markdown
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
````

- [ ] **Passo 2: reescrever `global/skills/implementar/spec-template.md`**

````markdown
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
````

- [ ] **Passo 3: atualizar `global/CLAUDE.md`**

Troque a seção "## Implementação" por:

```markdown
## Implementação
- Toda implementação (feature, correção, refactor) segue a skill `implementar`: eu planejo com você e escrevo a spec,
  um time de subagentes implementa pelo workflow `time-de-agentes` (Haiku/Sonnet, com gates, revisão e escada), eu faço a leitura final e a QA.
- Subagentes sempre com modelo explícito; nunca deixe herdar o da sessão.
- No fim do fluxo, a memória do projeto é atualizada e commitada no dev-brain sem perguntar; o diff vai no resumo.
```

- [ ] **Passo 4: atualizar `templates/CLAUDE.md.tpl`**

Troque o bloco final:

```markdown
## Específico deste projeto
<!-- Comandos de build/test, convenções e armadilhas que só valem aqui. -->
```

por:

```markdown
## Específico deste projeto
<!-- Gates usados pelo time de agentes quando a spec não define os seus. {arquivos} = arquivos da tarefa. -->
gate-tarefa: <ex.: npm run lint -- {arquivos} && npx vitest related {arquivos} --run>
gate-onda: <ex.: npm run lint && npm run typecheck && npm test>

<!-- Comandos de build/test, convenções e armadilhas que só valem aqui. -->
```

- [ ] **Passo 5: atualizar o `README.md`**

Na seção "## Estrutura", troque o bloco de código por:

```
install-tools.sh      # instala ferramentas de dev no Ubuntu/WSL (apt + nvm + claude) e configura bash/fish
bootstrap.sh          # configura a máquina (symlinks + checagem de deps)
new-project.sh        # cria memória + CLAUDE.md de um projeto novo
bin/project           # CLI create/start/exit de projetos em ~/workfolder -> ~/.local/bin/project
bin/spec-check        # valida as tarefas de uma spec e calcula as ondas -> ~/.local/bin/spec-check
lib/                  # código Node usado pelos bins (sem dependências)
global/CLAUDE.md      # instruções globais  -> ~/.claude/CLAUDE.md
global/skills/<nome>/ # uma pasta por skill -> ~/.claude/skills/<nome>
global/agents/<nome>.md # subagentes do time -> ~/.claude/agents/<nome>.md
global/workflows/     # scripts de Workflow (time.js: o time de agentes)
templates/            # modelos usados pelo new-project.sh
memory/README.md      # índice de projetos
memory/<projeto>/     # README, arquitetura, estado-atual, decisoes, roadmap, specs/
docs/                 # specs e planos do próprio dev-brain
exemplos/sandbox/     # repo de teste do time de agentes
tests/                # node --test 'tests/*.test.cjs' && bash tests/*.test.sh
```

Troque a seção "## Implementando: skill `implementar`" inteira por:

```markdown
## Implementando: skill `implementar`

Toda implementação vira trabalho de um time:
1. o agente da sessão (Opus) planeja com você e grava a spec em `memory/<projeto>/specs/AAAA-MM-DD-<slug>.md`
   (modelo em `global/skills/implementar/spec-template.md`), com as tarefas num bloco YAML;
2. `spec-check` valida as tarefas e calcula as **ondas** (tarefas sem dependência entre si e com arquivos disjuntos rodam juntas);
3. o workflow `time-de-agentes` (`global/workflows/time.js`) roda cada onda:
   dev → gate da tarefa → (escada) → gate da onda → commit por tarefa → revisão Sonnet → correções;
4. escada por tamanho: **P** Haiku → Haiku → Sonnet; **M** Sonnet → Sonnet; depois disso a tarefa bloqueia e vai para o resumo;
5. o Opus lê o resultado e o diff consolidado uma vez, roda a QA de interface (`qa-browser`: `chrome-windows` no WSL,
   Claude in Chrome no Linux/macOS) e fecha a memória com a tabela de métricas.

Depois do seu "ok" na spec, o time roda sozinho até o resumo. Acompanhe pelo `/workflows` ou pelo Habblaud.
Subagentes ficam em `global/agents/`: `dev-rapido`, `dev`, `gate`, `commit`, `revisor`, `qa-browser`.
```

- [ ] **Passo 6: conferir**

Run: `node --test 'tests/*.test.cjs' && grep -c "time-de-agentes" global/skills/implementar/SKILL.md README.md global/CLAUDE.md`
Expected: testes `fail 0`; cada arquivo com contagem ≥ 1.

- [ ] **Passo 7: commit**

```bash
git add global/skills/implementar global/CLAUDE.md templates/CLAUDE.md.tpl README.md
git commit -m "feat: skill implementar orquestra o time de agentes"
```

---

### Tarefa 5: `bootstrap.sh` linka agentes e cria `CLAUDE.maquina.md`

**Files:**
- Modify: `bootstrap.sh` (seção "Symlinks", depois do laço de skills)
- Modify: `global/CLAUDE.md` (seção nova no fim)
- Modify: `README.md` (lista do que o bootstrap faz)
- Test: `tests/bootstrap.test.sh`

**Interfaces:**
- Produces: `~/.claude/agents/<nome>.md` → `global/agents/<nome>.md`; `~/.claude/CLAUDE.maquina.md` (criado uma vez, nunca sobrescrito), importado pelo `global/CLAUDE.md`.

- [ ] **Passo 1: escrever o teste**

`tests/bootstrap.test.sh`:

```bash
#!/usr/bin/env bash
# Roda o bootstrap.sh com um HOME temporário e confere symlinks e o CLAUDE.maquina.md.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falha() { printf 'FALHOU: %s\n' "$*" >&2; exit 1; }

mkdir -p "$tmp/.claude"
printf '@RTK.md\n' > "$tmp/.claude/CLAUDE.md"   # máquina com CLAUDE.md próprio

HOME="$tmp" bash "$raiz/bootstrap.sh" >/dev/null

[ "$(readlink "$tmp/.claude/CLAUDE.md")" = "$raiz/global/CLAUDE.md" ] || falha "CLAUDE.md global não linkado"
ls "$tmp"/.claude/CLAUDE.md.bak.* >/dev/null 2>&1 || falha "backup do CLAUDE.md antigo não criado"
for a in "$raiz"/global/agents/*.md; do
  [ "$(readlink "$tmp/.claude/agents/$(basename "$a")")" = "$a" ] || falha "agente não linkado: $(basename "$a")"
done
[ -f "$tmp/.claude/CLAUDE.maquina.md" ] || falha "CLAUDE.maquina.md não criado"
grep -q '@~/.claude/CLAUDE.maquina.md' "$raiz/global/CLAUDE.md" || falha "global/CLAUDE.md não importa o CLAUDE.maquina.md"

printf '@RTK.md\n' > "$tmp/.claude/CLAUDE.maquina.md"
HOME="$tmp" bash "$raiz/bootstrap.sh" >/dev/null
grep -qx '@RTK.md' "$tmp/.claude/CLAUDE.maquina.md" || falha "CLAUDE.maquina.md foi sobrescrito"

printf 'ok: bootstrap\n'
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bash tests/bootstrap.test.sh`
Expected: `FALHOU: agente não linkado: commit.md`

- [ ] **Passo 3: alterar o `bootstrap.sh`**

Logo depois do laço `for skill in ...; done`, acrescente:

```bash
for agent_md in "$DEV_BRAIN_HOME"/global/agents/*.md; do
  [ -f "$agent_md" ] || continue
  link "$agent_md" "$CLAUDE_DIR/agents/$(basename "$agent_md")"
done

# Instruções só desta máquina, importadas pelo global/CLAUDE.md. Criado uma vez; nunca sobrescrito.
maquina="$CLAUDE_DIR/CLAUDE.maquina.md"
if [ -e "$maquina" ]; then
  skipped_items+=("já existe: ${maquina/#$HOME/\~}")
else
  printf '<!-- Instruções que só valem nesta máquina (fora do git). Ex.: @RTK.md -->\n' > "$maquina"
  done_items+=("criado: ${maquina/#$HOME/\~} (mova para cá o que era só desta máquina)")
fi
```

- [ ] **Passo 4: acrescentar no fim do `global/CLAUDE.md`**

```markdown

## Esta máquina
Instruções que só valem neste computador ficam em `~/.claude/CLAUDE.maquina.md` (criado pelo `bootstrap.sh`, fora do git):
@~/.claude/CLAUDE.maquina.md
```

- [ ] **Passo 5: atualizar o `README.md`**

Na lista "O `bootstrap.sh` é idempotente e pode rodar quantas vezes quiser. Ele:", troque o primeiro item por:

```markdown
- cria symlinks de `global/CLAUDE.md`, de cada skill e de cada subagente (`global/agents/`) em `~/.claude/`, e de cada script de `bin/` em `~/.local/bin/`;
- cria `~/.claude/CLAUDE.maquina.md` (uma vez só) para instruções que valem só naquela máquina; o `global/CLAUDE.md` importa esse arquivo;
```

- [ ] **Passo 6: rodar e ver passar**

Run: `bash tests/bootstrap.test.sh && node --test 'tests/*.test.cjs'`
Expected: `ok: bootstrap` e `fail 0`.

- [ ] **Passo 7: commit**

```bash
git add bootstrap.sh global/CLAUDE.md README.md tests/bootstrap.test.sh
git commit -m "feat: bootstrap linka subagentes e cria CLAUDE.maquina.md"
```

---

### Tarefa 6: `install-tools.sh` com fase `shell` e suporte a fish

**Files:**
- Modify: `install-tools.sh` (`install_user`, nova `install_shell`, `case` final, comentário do topo)
- Modify: `README.md` (seção "Máquina nova")
- Test: `tests/install-shell.test.sh`

**Interfaces:**
- Produces: `./install-tools.sh shell` (sem sudo) grava as linhas do bash e, se houver fish, `~/.config/fish/conf.d/dev-brain.fish`.

- [ ] **Passo 1: escrever o teste**

`tests/install-shell.test.sh`:

```bash
#!/usr/bin/env bash
# Roda a fase shell do install-tools.sh com HOME temporário, duas vezes.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falha() { printf 'FALHOU: %s\n' "$*" >&2; exit 1; }

mkdir -p "$tmp/.config/fish"
HOME="$tmp" bash "$raiz/install-tools.sh" shell >/dev/null
HOME="$tmp" bash "$raiz/install-tools.sh" shell >/dev/null

conf="$tmp/.config/fish/conf.d/dev-brain.fish"
[ -f "$conf" ] || falha "conf do fish não criado"
grep -q 'set -gx DEV_BRAIN_HOME' "$conf" || falha "DEV_BRAIN_HOME ausente no fish"
grep -q 'fish_add_path -g $HOME/.local/bin' "$conf" || falha "PATH ausente no fish"
if command -v fish >/dev/null 2>&1; then
  fish -n "$conf" || falha "sintaxe inválida no fish"
fi
[ "$(grep -c '^# dev-brain$' "$tmp/.bashrc")" = 1 ] || falha "linha do dev-brain duplicada no .bashrc"
[ "$(grep -c '^# claude bypass$' "$tmp/.bashrc")" = 1 ] || falha "alias duplicado no .bashrc"

printf 'ok: install-tools shell\n'
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `bash tests/install-shell.test.sh`
Expected: falha com `uso: .../install-tools.sh [system|user|all]`.

- [ ] **Passo 3: alterar o `install-tools.sh`**

No comentário do topo, troque as linhas de uso por:

```bash
# install-tools.sh [system|user|shell|all]: instala as ferramentas de dev no Ubuntu/WSL.
# Idempotente: pula o que já está instalado.
#   system  pacotes apt (precisa de root: sudo ./install-tools.sh system)
#   user    nvm/node, nest cli, claude code e a fase shell (como seu usuário, sem sudo)
#   shell   só a configuração do shell: ~/.bashrc e, se houver fish, ~/.config/fish/conf.d/dev-brain.fish
#   all     system + user (padrão; usa sudo na parte system)
```

Em `install_user`, troque o bloco final:

```bash
  say "PATH, DEV_BRAIN_HOME e alias do claude no ~/.bashrc"
  append_once "$HOME/.bashrc" "# local bin" 'export PATH="$HOME/.local/bin:$PATH"'
  append_once "$HOME/.bashrc" "# dev-brain" "export DEV_BRAIN_HOME=\"${DEV_BRAIN_HOME/#$HOME/\$HOME}\""
  append_once "$HOME/.bashrc" "# claude bypass" "alias claude='claude --dangerously-skip-permissions'"
}
```

por:

```bash
  install_shell
}

# shellcheck disable=SC2016  # $HOME/$PATH literais de propósito
install_shell() {
  [ "$(id -u)" -ne 0 ] || { echo "A fase shell roda como seu usuário, não root." >&2; exit 1; }

  say "PATH, DEV_BRAIN_HOME e alias do claude no ~/.bashrc"
  append_once "$HOME/.bashrc" "# local bin" 'export PATH="$HOME/.local/bin:$PATH"'
  append_once "$HOME/.bashrc" "# dev-brain" "export DEV_BRAIN_HOME=\"${DEV_BRAIN_HOME/#$HOME/\$HOME}\""
  append_once "$HOME/.bashrc" "# claude bypass" "alias claude='claude --dangerously-skip-permissions'"

  if command -v fish >/dev/null 2>&1 || [ -d "$HOME/.config/fish" ]; then
    say "fish: ~/.config/fish/conf.d/dev-brain.fish"
    mkdir -p "$HOME/.config/fish/conf.d"
    cat > "$HOME/.config/fish/conf.d/dev-brain.fish" <<EOF
# Gerado pelo dev-brain/install-tools.sh; rode de novo para atualizar.
set -gx DEV_BRAIN_HOME "${DEV_BRAIN_HOME/#$HOME/\$HOME}"
fish_add_path -g \$HOME/.local/bin
alias claude 'claude --dangerously-skip-permissions'
EOF
  fi
}
```

No `case` final, acrescente a linha `shell`:

```bash
case "${1:-all}" in
  system) install_system ;;
  user)   install_user ;;
  shell)  install_shell ;;
  all)    sudo "$0" system; install_user ;;
  *)      echo "uso: $0 [system|user|shell|all]" >&2; exit 1 ;;
esac
```

- [ ] **Passo 4: atualizar o `README.md`**

Na seção "## Máquina nova", depois de "Fases separadas: ...", acrescente:

```markdown
Só a configuração do shell (máquina que já tem as ferramentas): `./install-tools.sh shell`.
Se houver **fish**, ela grava `~/.config/fish/conf.d/dev-brain.fish` com `DEV_BRAIN_HOME`, `~/.local/bin` no PATH e o alias do claude.
```

- [ ] **Passo 5: rodar e ver passar**

Run: `bash tests/install-shell.test.sh && bash tests/bootstrap.test.sh && node --test 'tests/*.test.cjs' && bash -n install-tools.sh bootstrap.sh`
Expected: `ok: install-tools shell`, `ok: bootstrap`, `fail 0`, sem saída do `bash -n`.

- [ ] **Passo 6: commit**

```bash
git add install-tools.sh README.md tests/install-shell.test.sh
git commit -m "feat: install-tools ganha fase shell com suporte a fish"
```

---

### Tarefa 7: sandbox de ponta a ponta

**Files:**
- Create: `exemplos/sandbox/README.md`, `exemplos/sandbox/CLAUDE.md`, `exemplos/sandbox/package.json`,
  `exemplos/sandbox/scripts/testar.sh`, `exemplos/sandbox/src/.gitkeep`,
  `exemplos/sandbox/tests/slug.test.js`, `exemplos/sandbox/tests/moeda.test.js`, `exemplos/sandbox/tests/url-produto.test.js`,
  `exemplos/sandbox/spec.md`

**Interfaces:**
- Produces: um projeto JS sem dependências (desvio consciente do "TS mínimo" da spec: sem `npm install`, o teste roda offline e mais rápido)
  com testes de aceite fixos e uma spec de 3 tarefas no formato novo.

- [ ] **Passo 1: criar os arquivos**

`exemplos/sandbox/package.json`:

```json
{
  "name": "sandbox",
  "private": true,
  "type": "commonjs",
  "scripts": { "test": "bash scripts/testar.sh src/*.js" }
}
```

`exemplos/sandbox/scripts/testar.sh`:

```bash
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
```

`exemplos/sandbox/src/.gitkeep`: arquivo vazio.

`exemplos/sandbox/tests/slug.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('../src/slug');

test('minúsculas e hífens', () => assert.equal(slugify('Camiseta Azul'), 'camiseta-azul'));
test('remove acentos', () => assert.equal(slugify('Ação Única'), 'acao-unica'));
test('colapsa separadores e apara as pontas', () => assert.equal(slugify('  Olá,   Mundo!! '), 'ola-mundo'));
test('texto vazio', () => assert.equal(slugify(''), ''));
```

`exemplos/sandbox/tests/moeda.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatarBRL } = require('../src/moeda');

test('milhar e centavos', () => assert.equal(formatarBRL(123456), 'R$ 1.234,56'));
test('zero', () => assert.equal(formatarBRL(0), 'R$ 0,00'));
test('negativo com sinal antes do símbolo', () => assert.equal(formatarBRL(-1000), '-R$ 10,00'));
test('espaço comum, não NBSP', () => assert.ok(!formatarBRL(100).includes(' ')));
test('rejeita centavos não inteiros', () => assert.throws(() => formatarBRL(1.5), TypeError));
```

`exemplos/sandbox/tests/url-produto.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { urlProduto } = require('../src/url-produto');

test('monta a url com slug e id', () => assert.equal(urlProduto('Camiseta Azul', 42), '/p/camiseta-azul-42'));
test('id precisa ser inteiro positivo', () => assert.throws(() => urlProduto('x', 0), RangeError));
```

`exemplos/sandbox/CLAUDE.md`:

```markdown
# sandbox

Projeto de teste do time de agentes do dev-brain. Memória: este próprio diretório (`README.md`).

## Específico deste projeto
gate-tarefa: bash scripts/testar.sh {arquivos}
gate-onda: bash scripts/testar.sh src/*.js

- JavaScript CommonJS, sem dependências. Um módulo por arquivo em `src/`, exportando funções nomeadas.
- Os testes em `tests/` são os critérios de aceite: nunca altere.
```

`exemplos/sandbox/README.md`:

```markdown
# sandbox

Repo mínimo para testar o workflow `time-de-agentes` de ponta a ponta. Não é um projeto de verdade.

- `tests/` traz os testes de aceite prontos; `src/` começa vazio.
- `spec.md` tem 3 tarefas: 1 e 2 em paralelo, 3 depende de 1. A tarefa 2 (moeda) costuma falhar de primeira
  (o `Intl` usa NBSP e põe o sinal no lugar errado), o que exercita a escada.

Como rodar: copie a pasta para um diretório temporário, `git init` e commit inicial, e siga a etapa 3 em diante
da skill `implementar` com `spec.md` (repo = a cópia; memória = a cópia).
```

`exemplos/sandbox/spec.md`:

````markdown
# Utilitários de catálogo

**Status:** planejada
**Data:** 2026-10-13
**Projeto:** sandbox

## Objetivo
Três funções puras para o catálogo: slug de texto, formatação de reais e URL de produto.

## Contexto
`src/` está vazio. Os testes de aceite já estão em `tests/` e são a definição de pronto.

## Decisões
- Sem dependências: só JavaScript e módulos nativos do Node.

## Fora de escopo
- Alterar qualquer arquivo em `tests/`.

## Padrões a seguir
- CommonJS: `module.exports = { nomeDaFuncao }`. Um módulo por arquivo.

## Contratos
- `slugify(texto: string): string`: minúsculas, sem acento, só `[a-z0-9]` separados por um hífen, sem hífen nas pontas.
- `formatarBRL(centavos: number): string`: `"R$ 1.234,56"`, `"-R$ 10,00"` para negativos, espaço comum (U+0020);
  `TypeError` se `centavos` não for inteiro.
- `urlProduto(nome: string, id: number): string`: `"/p/<slugify(nome)>-<id>"`; `RangeError` se `id` não for inteiro positivo.

## Tarefas
```yaml
- id: 1
  titulo: slugify
  tamanho: P
  arquivos: [src/slug.js]
  depende: []
  aceite:
    - tests/slug.test.js passa
- id: 2
  titulo: formatarBRL
  tamanho: P
  arquivos: [src/moeda.js]
  depende: []
  aceite:
    - tests/moeda.test.js passa
    - negativo sai como "-R$ 10,00" e o espaço é U+0020, não NBSP
- id: 3
  titulo: urlProduto
  tamanho: P
  arquivos: [src/url-produto.js]
  depende: [1]
  referencia: src/slug.js
  aceite:
    - tests/url-produto.test.js passa
    - reaproveita slugify de src/slug.js
```

## Como ficou
````

Run: `chmod +x exemplos/sandbox/scripts/testar.sh`

- [ ] **Passo 2: conferir o comportamento do gate antes da implementação**

Run: `cd exemplos/sandbox && bash scripts/testar.sh src/*.js; bash scripts/testar.sh src/slug.js; cd -`
Expected: `nada para testar` duas vezes, exit 0 (sem `src/*.js`, e `src/slug.js` ainda não existe).

- [ ] **Passo 3: conferir que a spec do sandbox passa no `spec-check`**

Run:
```bash
printf '%s' '{"gates":{"tarefa":"bash scripts/testar.sh {arquivos}","onda":"bash scripts/testar.sh src/*.js"},"tarefas":[{"id":1,"titulo":"slugify","tamanho":"P","arquivos":["src/slug.js"],"depende":[],"aceite":["tests/slug.test.js passa"]},{"id":2,"titulo":"formatarBRL","tamanho":"P","arquivos":["src/moeda.js"],"depende":[],"aceite":["tests/moeda.test.js passa","negativo sai como \"-R$ 10,00\" e o espaço é U+0020, não NBSP"]},{"id":3,"titulo":"urlProduto","tamanho":"P","arquivos":["src/url-produto.js"],"depende":[1],"referencia":"src/slug.js","aceite":["tests/url-produto.test.js passa","reaproveita slugify de src/slug.js"]}]}' | ./bin/spec-check | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(s.ondas))'
```
Expected: `[[1,2],[3]]`

- [ ] **Passo 4: commit**

```bash
git add exemplos/sandbox
git commit -m "test: sandbox de ponta a ponta do time de agentes"
```

---

### Tarefa 8: instalar o dev-brain neste PC

**Files:** nenhum no repo (configuração da máquina).

- [ ] **Passo 1: preservar o CLAUDE.md atual**

Run: `cat ~/.claude/CLAUDE.md`
Expected: `@RTK.md` (conteúdo atual, que vai para o `CLAUDE.maquina.md`).

- [ ] **Passo 2: rodar o bootstrap**

Run: `~/dev-brain/bootstrap.sh`
Expected: "Feito" lista os links de `CLAUDE.md`, skills, agentes, `project`, `spec-check` e `criado: ~/.claude/CLAUDE.maquina.md`;
"Ação manual" lista o backup `~/.claude/CLAUDE.md.bak.<data>`.

- [ ] **Passo 3: mover o que era só desta máquina**

Run: `printf '@RTK.md\n' > ~/.claude/CLAUDE.maquina.md && cat ~/.claude/CLAUDE.maquina.md`
Expected: `@RTK.md`.

- [ ] **Passo 4: configurar o shell**

Run: `~/dev-brain/install-tools.sh shell && fish -c 'echo $DEV_BRAIN_HOME; type -q spec-check; and echo spec-check ok'`
Expected: `/home/tiago.reiz/dev-brain` e `spec-check ok`.

- [ ] **Passo 5: conferir**

Run: `ls -l ~/.claude/agents/ && readlink ~/.claude/CLAUDE.md && command -v project spec-check`
Expected: 6 links para `~/dev-brain/global/agents/*.md`, `CLAUDE.md` → `~/dev-brain/global/CLAUDE.md`, os dois comandos em `~/.local/bin`.

Sem commit (nada muda no repo).

---

### Tarefa 9: Habblaud

**Files:**
- Modify: `README.md` (seção nova "Visibilidade: Habblaud")

- [ ] **Passo 1: clonar na versão auditada**

Run:
```bash
git clone https://github.com/marmottajr/habblaud.git ~/habblaud
git -C ~/habblaud checkout --detach 4ccce2537472fe5a8d432f06974494d2e778ff15
```
Expected: `HEAD is now at 4ccce25`.

- [ ] **Passo 2: subir em Docker**

Run: `cd ~/habblaud && npm install && npm run docker:up`
Expected: container `habblaud` no ar.

Run: `curl -sf http://localhost:4747/api/health`
Expected: JSON de saúde com status ok.

- [ ] **Passo 3: instalar o mod no Claude Code**

Run: `cd ~/habblaud && npm run mod:install && npm run mod:status`
Expected: mod, `habblaud-permissoes` e `habblaud-mensagens` instalados na conta.

- [ ] **Passo 4: documentar no `README.md`**

Acrescente antes de "## Atualizando a memória":

```markdown
## Visibilidade: Habblaud

O [Habblaud](https://github.com/marmottajr/habblaud) mostra as sessões e subagentes do Claude Code como um escritório
em pixel art (`http://localhost:4747`): quem está trabalhando, quem precisa de você e o uso de 5h/semanal.
Roda local, em Docker, e só lê os arquivos que o Claude Code já grava.

```bash
git clone https://github.com/marmottajr/habblaud.git ~/habblaud && cd ~/habblaud
npm install && npm run docker:up        # sobe em http://localhost:4747 e reinicia com o Docker
npm run mod:install                     # uso de 5h/semanal, aprovar permissões e mandar mensagens pelo escritório
```

Atualizar: `git pull && npm install && npm run docker:up`.
Atenção: o plugin de mensagens deixa qualquer processo local mandar prompts às sessões abertas; com o alias de bypass, isso vira execução sem aprovação. Para ficar sem ele: `npm run mod:install -- --sem-mensagens`. Desinstalar: `npm run mod:uninstall && npm run docker:down`.
```

- [ ] **Passo 5: commit**

```bash
git add README.md
git commit -m "docs: Habblaud para acompanhar o time"
```

---

### Tarefa 10: rodar o sandbox de ponta a ponta e registrar

**Files:**
- Modify: `docs/specs/2026-10-13-time-de-agentes-design.md` (seção nova "Validação" no fim)

- [ ] **Passo 1: preparar a cópia**

Run (o `$S` é o scratchpad da sessão):
```bash
rm -rf "$S/sandbox-e2e" && cp -r ~/dev-brain/exemplos/sandbox "$S/sandbox-e2e"
cd "$S/sandbox-e2e" && git init -q -b main && git add -A && git commit -qm "base" && git rev-parse HEAD
```
Expected: um SHA (o `base`).

- [ ] **Passo 2: gerar os args**

Grave em `$S/tarefas.json` o JSON do Passo 3 da Tarefa 7 e rode `spec-check < "$S/tarefas.json" > "$S/args.json"`.
Expected: exit 0, `ondas` = `[[1,2],[3]]`.

- [ ] **Passo 3: rodar o Workflow**

Chamar a ferramenta Workflow com `scriptPath: "/home/tiago.reiz/dev-brain/global/workflows/time.js"` e `args` =
conteúdo de `args.json` + `repo: "<S>/sandbox-e2e"`, `spec: "<S>/sandbox-e2e/spec.md"`, `memoria: "<S>/sandbox-e2e"`, `base: "<sha>"`.
Acompanhar pelo Habblaud em `http://localhost:4747`.

- [ ] **Passo 4: conferir**

Run: `cd "$S/sandbox-e2e" && git log --oneline && git status --porcelain && bash scripts/testar.sh src/*.js`
Expected: 3 commits de tarefa (mais eventuais `fix:`) sobre o `base`, working tree limpo, todos os testes passando.
No retorno do workflow: as 3 tarefas `ok`; `ondas[0].tarefas = [1,2]`, `ondas[1].tarefas = [3]`.
Se algo não bater: diagnosticar (journal do workflow), corrigir `time.js`/agentes, rodar os testes do repo e repetir o e2e.

- [ ] **Passo 5: registrar na spec**

Acrescente no fim de `docs/specs/2026-10-13-time-de-agentes-design.md`:

```markdown
## Validação (2026-10-13)

E2E no `exemplos/sandbox`: <tabela de métricas do retorno: Tarefa | Tam. | Status | Modelos | Tentativas | Revisões>
- Commits: <lista>
- Escada: <se a tarefa 2 subiu de degrau e por quê>
- Habblaud: <subagentes apareceram ou não>
- Ajustes feitos durante a validação: <lista ou "nenhum">
```

com os valores reais.

- [ ] **Passo 6: commit**

```bash
git add docs/specs/2026-10-13-time-de-agentes-design.md
git commit -m "docs: validação de ponta a ponta do time de agentes"
```

---

## Depois do plano

Rodar o comando de testes do repo completo, revisar a branch inteira e decidir a integração
(merge na `main` e push) com a skill `superpowers:finishing-a-development-branch`.
O piloto num projeto real (`poc-app-maker`) fica para a próxima feature de verdade.
