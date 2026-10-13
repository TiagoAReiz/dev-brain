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

// Todo comando do gate chega como `echo '<base64>' | base64 -d | bash`: devolve o comando decodificado.
const comandoDoGate = (prompt) => {
  const m = prompt.match(/^Comando:\necho '([A-Za-z0-9+/=]+)' \| base64 -d \| bash$/m);
  if (!m) throw new Error(`gate sem comando em base64: ${prompt}`);
  return Buffer.from(m[1], 'base64').toString('utf8');
};
// Script de commit (já decodificado) ou null.
const scriptDeCommit = (cmd) => (cmd.includes('git commit') ? cmd : null);

const tarefa = (id, extra = {}) => ({
  id, titulo: `T${id}`, tamanho: 'P', arquivos: [`src/t${id}.js`], depende: [], aceite: ['ok'],
  failsafe: false, gate: `gate-tarefa ${id}`, ...extra,
});

// comportamento(tipo, prompt, opts, chamadas) devolve a resposta do agente ou undefined para o padrão.
async function simular({ tarefas, ondas, comportamento = () => undefined }) {
  const chamadas = [];
  let sha = 0;
  const agent = async (prompt, opts) => {
    if (opts.agentType === 'gate') prompt = comandoDoGate(prompt);
    chamadas.push({ prompt, opts });
    const tipo = opts.agentType;
    const r = await comportamento(tipo, prompt, opts, chamadas);
    if (r !== undefined) return r;
    if (tipo === 'dev-rapido' || tipo === 'dev') return { status: 'pronto', arquivos: [], resumo: 'feito' };
    if (tipo === 'gate') {
      const script = scriptDeCommit(prompt);
      if (!script) return { ok: true, exit_code: 0, saida: '' };
      const idx = [...script.matchAll(/echo "SHA (\d+) \$\(/g)].map((m) => m[1]);
      return { ok: true, exit_code: 0, saida: idx.map((i) => `SHA ${i} ${(++sha).toString(16).padStart(7, '0')}`).join('\n') };
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
  assert.ok(!chamadas.some((c) => scriptDeCommit(c.prompt)), 'nada para commitar');
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
  assert.equal(porId[1].pendencias[0], 'rota não existe');
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


test('tarefa bloqueada tem as alterações guardadas em stash antes do gate da onda', async () => {
  const ordem = [];
  const { porId } = await simular({
    tarefas: [tarefa(1), tarefa(2, { arquivos: ['src/a b.js'] })], ondas: [[1, 2]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'gate') ordem.push(prompt);
      if (tipo === 'gate' && prompt.includes("gate-tarefa 2")) return { ok: false, exit_code: 1, saida: 'quebrado' };
    },
  });
  assert.equal(porId[2].status, 'bloqueada');
  assert.equal(porId[1].status, 'ok');
  const iStash = ordem.findIndex((c) => c.includes('git stash push -u') && c.includes("'src/a b.js'"));
  const iOnda = ordem.findIndex((c) => c.includes('gate-onda'));
  assert.ok(iStash !== -1, `sem stash: ${JSON.stringify(ordem)}`);
  assert.ok(iStash < iOnda, 'stash precisa vir antes do gate da onda');
  assert.ok(porId[2].pendencias.some((p) => p.includes('git stash')));
});

test('commit é um script determinístico: arquivos entre aspas, mensagem em heredoc e trava contra atribuição', async () => {
  const { chamadas, porId } = await simular({
    tarefas: [tarefa(1, { titulo: 'Rota `POST /x` com $HOME e "aspas" — ação', arquivos: ['src/a b.js', 'src/c.js'] })],
    ondas: [[1]],
  });
  const commits = chamadas.map((c) => scriptDeCommit(c.prompt)).filter(Boolean);
  assert.equal(commits.length, 1);
  const script = commits[0];
  assert.match(script, /^git add -A -- 'src\/a b\.js' 2>\/dev\/null \|\| true$/m);
  assert.match(script, /^git add -A -- 'src\/c\.js' 2>\/dev\/null \|\| true$/m);
  assert.ok(script.includes("git commit -q -F - <<'MSG_0'\nRota `POST /x` com $HOME e \"aspas\" — ação (tarefa 1)\nMSG_0\n"), script);
  assert.match(script, /co-authored-by\|generated with/);
  assert.equal(chamadas.find((c) => scriptDeCommit(c.prompt)).opts.agentType, 'gate');
  assert.deepEqual(porId[1].commits, ['0000001']);
});

test('commit que falha (ex.: atribuição de IA detectada) bloqueia por commit', async () => {
  const { porId } = await simular({
    tarefas: [tarefa(1)], ondas: [[1]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'gate' && scriptDeCommit(prompt)) return { ok: false, exit_code: 3, saida: 'ATRIBUICAO 0' };
    },
  });
  assert.equal(porId[1].status, 'bloqueada');
  assert.equal(porId[1].motivo, 'commit');
  assert.match(porId[1].pendencias[0], /ATRIBUICAO 0/);
});

test('integração: o script de commit roda num repo git de verdade', async () => {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'base');
  fs.mkdirSync(path.join(repo, 'src'));
  fs.writeFileSync(path.join(repo, 'src', 'a b.js'), 'x');
  fs.writeFileSync(path.join(repo, 'src', 'fora.js'), 'não é da tarefa');
  const titulo = 'Ação `rm -rf /` com $HOME e "aspas"';
  const { chamadas } = await simular({ tarefas: [tarefa(1, { titulo, arquivos: ['src/a b.js', 'src/nao-existe.js'] })], ondas: [[1]] });
  const script = chamadas.map((c) => scriptDeCommit(c.prompt)).find(Boolean);
  const saida = execFileSync('bash', ['-c', script], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  });
  assert.match(saida, /^SHA 0 [0-9a-f]{7,}$/m);
  assert.equal(git('log', '-1', '--format=%B').trim(), `${titulo} (tarefa 1)`);
  assert.equal(git('show', '--name-only', '--format=', 'HEAD').trim(), 'src/a b.js');
  assert.match(git('status', '--porcelain'), /\?\? src\/fora\.js/);
});

test('SHA do commit é lido mesmo se o gate comentar a saída', async () => {
  const { porId } = await simular({
    tarefas: [tarefa(1)], ondas: [[1]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'gate' && scriptDeCommit(prompt)) {
        return { ok: true, exit_code: 0, saida: 'Execução 1: saída "SHA 0 29f4d3d", exit 0.\nExecução 2: SHA 0 -' };
      }
    },
  });
  assert.deepEqual(porId[1].commits, ['29f4d3d']);
});

test('gate da tarefa vai em base64 e chega igual ao da spec (nada reescreve o comando)', async () => {
  const { chamadas } = await simular({ tarefas: [tarefa(1, { gate: "npx vitest related 'a b.ts' --run && npm run -s typecheck" })], ondas: [[1]] });
  assert.ok(chamadas.some((c) => c.opts.agentType === 'gate' && c.prompt === "npx vitest related 'a b.ts' --run && npm run -s typecheck"));
});

test('integração: o stash guarda o que existe e ignora caminho inexistente', async () => {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'stash-'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'base');
  fs.mkdirSync(path.join(repo, 'src'));
  fs.writeFileSync(path.join(repo, 'src', 'a b.js'), 'quebrado');
  const { chamadas } = await simular({
    tarefas: [tarefa(1, { arquivos: ['src/a b.js'] })], ondas: [[1]],
    comportamento: (tipo, prompt) => {
      if (tipo === 'dev-rapido' || tipo === 'dev') return { status: 'pronto', arquivos: ['outro/prefixo/src/a b.js'], resumo: 'x' };
      if (tipo === 'gate' && prompt.includes('gate-tarefa 1')) return { ok: false, exit_code: 1, saida: 'falhou' };
    },
  });
  const script = chamadas.map((c) => c.prompt).find((p) => p.includes('git stash push'));
  execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' });
  assert.equal(git('status', '--porcelain').trim(), '');
  assert.match(git('stash', 'list'), /time-de-agentes: tarefa 1 bloqueada/);
});
