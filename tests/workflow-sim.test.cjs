'use strict';
// Roda o global/workflows/time.js no Node com agentes falsos, para testar a lógica do fluxo sem gastar tokens.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'global', 'workflows', 'time.js'), 'utf8')
  .replace('export const meta =', 'const meta =');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const rodarScript = new AsyncFunction('args', 'agent', 'pipeline', 'log', FONTE);

// Mesma semântica do Workflow: um estágio que lança derruba o item para null.
const pipeline = (itens, ...estagios) => Promise.all(itens.map(async (item, i) => {
  let r = item;
  for (const estagio of estagios) {
    try { r = await estagio(r, item, i); } catch { return null; }
  }
  return r;
}));

const tarefa = (id, extra = {}) => ({
  id, titulo: `T${id}`, tamanho: 'P', arquivos: [`src/t${id}.js`], depende: [], aceite: ['ok'],
  failsafe: false, gate: `gate-tarefa ${id}`, ...extra,
});

// comportamento(tipo, prompt, opts, chamadas) devolve a resposta do agente ou undefined para o padrão.
async function simular({ tarefas, ondas, comportamento = () => undefined }) {
  const chamadas = [];
  let sha = 0;
  const agent = async (prompt, opts) => {
    chamadas.push({ prompt, opts });
    const tipo = opts.agentType;
    const r = await comportamento(tipo, prompt, opts, chamadas);
    if (r !== undefined) return r;
    if (tipo === 'dev-rapido' || tipo === 'dev') return { status: 'pronto', arquivos: [], resumo: 'feito' };
    if (tipo === 'gate') return { ok: true, exit_code: 0, saida: '' };
    if (tipo === 'commit') {
      const n = (prompt.match(/^\d+\. mensagem:/gm) || []).length;
      return { commits: Array.from({ length: n }, (_, indice) => ({ indice, sha: `c${++sha}` })), erro: null };
    }
    if (tipo === 'revisor') {
      const ids = [...prompt.matchAll(/- tarefa (\d+)/g)].map((m) => Number(m[1]));
      return { tarefas: ids.map((id) => ({ id, aprovada: true, problemas: [] })) };
    }
    throw new Error(`tipo inesperado: ${tipo}`);
  };
  const args = { repo: '/repo', spec: '/repo/spec.md', memoria: '/mem', base: 'b0', tarefas, ondas,
    gates: { tarefa: 'gate-tarefa {arquivos}', onda: 'gate-onda' } };
  const resultado = await rodarScript(args, agent, pipeline, () => {});
  return { resultado, chamadas, porId: Object.fromEntries(resultado.tarefas.map((t) => [t.id, t])) };
}

test('caminho feliz: tudo ok, um haiku por tarefa, um commit por tarefa', async () => {
  const { porId, resultado } = await simular({ tarefas: [tarefa(1), tarefa(2), tarefa(3, { depende: [1] })], ondas: [[1, 2], [3]] });
  for (const id of [1, 2, 3]) {
    assert.equal(porId[id].status, 'ok');
    assert.deepEqual(porId[id].modelos, ['haiku']);
    assert.equal(porId[id].commits.length, 1);
  }
  assert.deepEqual(resultado.ondas.map((o) => o.gate), ['ok', 'ok']);
});

test('escada: gate falha na 1ª tentativa e passa na 2ª', async () => {
  let falhou = false;
  const { porId } = await simular({
    tarefas: [tarefa(1)], ondas: [[1]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'gate' && prompt.includes('gate-tarefa 1') && !falhou) {
        falhou = true;
        return { ok: false, exit_code: 1, saida: 'teste X falhou' };
      }
    },
  });
  assert.equal(porId[1].status, 'ok');
  assert.deepEqual(porId[1].modelos, ['haiku', 'haiku']);
  assert.equal(porId[1].tentativas, 2);
});

test('escada esgotada: P sobe até sonnet e bloqueia; dependente é pulada', async () => {
  const { porId, chamadas } = await simular({
    tarefas: [tarefa(1), tarefa(2, { depende: [1] })], ondas: [[1], [2]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'gate' && prompt.includes('gate-tarefa 1')) return { ok: false, exit_code: 1, saida: 'sempre falha' };
    },
  });
  assert.equal(porId[1].status, 'bloqueada');
  assert.equal(porId[1].motivo, 'escada');
  assert.deepEqual(porId[1].modelos, ['haiku', 'haiku', 'sonnet']);
  assert.equal(porId[2].status, 'pulada');
  assert.equal(porId[2].motivo, 'depende de 1');
  assert.ok(!chamadas.some((c) => c.opts.agentType === 'commit'), 'nada para commitar');
});

test('spec inválida bloqueia na hora, sem gastar degrau', async () => {
  const { porId } = await simular({
    tarefas: [tarefa(1)], ondas: [[1]],
    comportamento: (tipo) => {
      if (tipo === 'dev-rapido') return { status: 'spec_invalida', arquivos: [], resumo: 'x', motivo: 'rota não existe' };
    },
  });
  assert.equal(porId[1].status, 'bloqueada');
  assert.equal(porId[1].motivo, 'spec');
  assert.equal(porId[1].tentativas, 1);
  assert.deepEqual(porId[1].pendencias, ['rota não existe']);
});

test('agente que lança erro bloqueia a tarefa em vez de tratá-la como pronta', async () => {
  const { porId, resultado } = await simular({
    tarefas: [tarefa(1), tarefa(2)], ondas: [[1, 2]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'dev-rapido' && prompt.includes('Sua tarefa: 1.')) throw new Error("agent type 'dev-rapido' not found");
    },
  });
  assert.equal(porId[1].status, 'bloqueada');
  assert.equal(porId[1].motivo, 'erro');
  assert.match(porId[1].pendencias[0], /not found/);
  assert.equal(porId[2].status, 'ok');
  assert.equal(resultado.ondas[0].gate, 'ok');
});

test('gate que lança erro não derruba o workflow', async () => {
  const { porId, resultado } = await simular({
    tarefas: [tarefa(1)], ondas: [[1]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'gate' && prompt.includes('gate-onda')) throw new Error('gate sumiu');
    },
  });
  assert.equal(resultado.ondas[0].gate, 'bloqueada');
  assert.equal(porId[1].status, 'bloqueada');
  assert.equal(porId[1].motivo, 'gate_onda');
});

test('revisão reprova uma vez: corrige, commita fix, revisa de novo e roda o gate pós-revisão', async () => {
  let reprovou = false;
  const { porId, resultado } = await simular({
    tarefas: [tarefa(1)], ondas: [[1]],
    comportamento: (tipo) => {
      if (tipo === 'revisor' && !reprovou) {
        reprovou = true;
        return { tarefas: [{ id: 1, aprovada: false, problemas: [{ arquivo: 'src/t1.js', linha: 3, evidencia: 'x', correcao: 'y' }] }] };
      }
    },
  });
  assert.equal(porId[1].status, 'ok');
  assert.equal(porId[1].revisoes, 2);
  assert.equal(porId[1].commits.length, 2);
  assert.deepEqual(porId[1].modelos, ['haiku', 'haiku']);
  assert.equal(resultado.ondas[0].gate_pos_revisao, 'ok');
});

test('revisão reprova duas vezes: bloqueia por revisão', async () => {
  const { porId } = await simular({
    tarefas: [tarefa(1)], ondas: [[1]],
    comportamento: (tipo) => {
      if (tipo === 'revisor') return { tarefas: [{ id: 1, aprovada: false, problemas: [{ arquivo: 'a', linha: null, evidencia: 'e', correcao: 'c' }] }] };
    },
  });
  assert.equal(porId[1].status, 'bloqueada');
  assert.equal(porId[1].motivo, 'revisao');
});

test('gate da onda falha: 1 correção com sonnet; se falhar de novo, as ondas seguintes não rodam', async () => {
  const { porId, resultado, chamadas } = await simular({
    tarefas: [tarefa(1), tarefa(2, { depende: [] })], ondas: [[1], [2]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'gate' && prompt.includes('gate-onda')) return { ok: false, exit_code: 1, saida: 'quebrou' };
    },
  });
  assert.equal(resultado.ondas[0].gate, 'bloqueada');
  assert.equal(resultado.ondas[0].correcao_onda, true);
  assert.ok(chamadas.some((c) => c.opts.label === 'correção onda 1' && c.opts.model === 'sonnet'));
  assert.equal(porId[1].motivo, 'gate_onda');
  assert.equal(porId[2].status, 'pulada');
  assert.equal(porId[2].motivo, 'onda 1 bloqueada');
});

