'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { parseArgs, montarArgs, arquivosAlterados, executar } = require('../lib/codex-agente.cjs');

const base = { prompt: 'oi', repo: '/r', escrever: false, timeout: 900, modelo: null, codexHome: null };
const parse = (...a) => parseArgs(a);

// --- parseArgs ---
test('parseArgs: padrões', () => {
  const r = parse('faça isso');
  assert.equal(r.ok, true);
  assert.deepEqual(r.opcoes, { prompt: 'faça isso', repo: process.cwd(), escrever: false, timeout: 900, modelo: null, codexHome: null });
});

test('parseArgs: sem prompt ou com "-" lê do stdin (prompt null)', () => {
  assert.equal(parse().opcoes.prompt, null);
  assert.equal(parse('-').opcoes.prompt, null);
});

test('parseArgs: todas as flags', () => {
  const r = parse('--repo', '/x', '--escrever', '--timeout', '30', '--modelo', 'm1', '--codex-home', '/h', '--', 'p');
  assert.deepEqual(r.opcoes, { prompt: 'p', repo: '/x', escrever: true, timeout: 30, modelo: 'm1', codexHome: '/h' });
});

test('parseArgs: erros', () => {
  assert.equal(parse('--nada').ok, false);
  assert.match(parse('--repo').erro, /valor/);
  assert.match(parse('--repo', '--escrever').erro, /valor/);
  for (const t of ['0', '7201', '-1', 'abc', '1.5', '']) assert.equal(parse('--timeout', t).ok, false, t);
  assert.equal(parse('--timeout', '7200').ok, true);
  assert.equal(parse('--timeout', '1').ok, true);
  assert.equal(parse('a', 'b').ok, false);
  assert.equal(parse('--ajuda').ok, false);
});

// --- montarArgs ---
test('montarArgs: read-only', () => {
  assert.deepEqual(montarArgs(base, '/t/o.txt'), ['exec', '-C', '/r', '-s', 'read-only', '-o', '/t/o.txt', '-']);
});

test('montarArgs: workspace-write com modelo', () => {
  assert.deepEqual(
    montarArgs({ ...base, escrever: true, modelo: 'm1' }, '/t/o.txt'),
    ['exec', '-C', '/r', '-s', 'workspace-write', '-o', '/t/o.txt', '-m', 'm1', '-'],
  );
});

test('montarArgs: repo não-git acrescenta --skip-git-repo-check', () => {
  assert.ok(montarArgs({ ...base, repoNaoGit: true }, '/o').includes('--skip-git-repo-check'));
  assert.ok(!montarArgs(base, '/o').includes('--skip-git-repo-check'));
});

test('montarArgs: nunca emite danger-full-access nem --dangerously-*', () => {
  for (const escrever of [false, true]) {
    const args = montarArgs({ ...base, escrever, modelo: 'm', repoNaoGit: !escrever }, '/o').join(' ');
    assert.doesNotMatch(args, /danger/);
  }
});

// --- arquivosAlterados ---
test('arquivosAlterados: só o que é novo, ordenado e sem duplicar', () => {
  const antes = ' M a.js\n?? b.js\n';
  const depois = ' M a.js\n?? b.js\n M z.js\nA  c.js\n?? c.js\n M z.js\n';
  assert.deepEqual(arquivosAlterados(antes, depois), ['c.js', 'z.js']);
  assert.deepEqual(arquivosAlterados('', ''), []);
  assert.deepEqual(arquivosAlterados(antes, antes), []);
});

test('arquivosAlterados: rename fica com o destino', () => {
  assert.deepEqual(arquivosAlterados('', 'R  velho.js -> novo.js\n'), ['novo.js']);
});

// --- executar com spawn falso ---
function filhoFalso({ code = 0, stderr = '', erro = null, aoIniciar = () => {}, fechar = true } = {}) {
  return (bin, args, opts) => {
    const f = new EventEmitter();
    f.pid = 4242;
    f.stdout = new EventEmitter();
    f.stderr = new EventEmitter();
    f.stdinRecebido = '';
    f.stdin = new EventEmitter();
    f.stdin.end = (t) => { f.stdinRecebido = t; };
    f.chamada = { bin, args, opts };
    f.fechar = (c, s = null) => f.emit('close', c, s);
    setImmediate(() => {
      aoIniciar(f);
      if (erro) return f.emit('error', Object.assign(new Error(erro), { code: erro }));
      if (stderr) f.stderr.emit('data', stderr);
      if (fechar) f.emit('close', code, null);
    });
    return f;
  };
}

function ambiente(extra = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-test-'));
  const status = { atual: '' };
  const kills = [];
  const deps = {
    bin: 'codex-falso',
    env: { A: '1' },
    tmpdir: tmp,
    kill: (pid, sinal) => kills.push([pid, sinal]),
    git: (repo, args) => (args[0] === 'rev-parse' ? 'true\n' : status.atual),
    ...extra,
  };
  return { deps, tmp, status, kills };
}

test('executar ok: resumo vem do -o, prompt no stdin, CODEX_HOME e grupo próprio', async () => {
  let filho;
  const amb = ambiente();
  amb.deps.spawn = (...a) => {
    filho = filhoFalso({
      aoIniciar: (f) => fs.writeFileSync(f.chamada.args[f.chamada.args.indexOf('-o') + 1], '  pronto  \n'),
    })(...a);
    return filho;
  };
  const r = await executar({ ...base, prompt: 'faça', codexHome: '/conta' }, amb.deps);
  assert.equal(r.codigo, 0);
  assert.equal(r.resultado.status, 'ok');
  assert.equal(r.resultado.resumo, 'pronto');
  assert.equal(r.resultado.sandbox, 'read-only');
  assert.deepEqual(r.resultado.arquivos, []);
  assert.equal(filho.stdinRecebido, 'faça');
  assert.equal(filho.chamada.bin, 'codex-falso');
  assert.equal(filho.chamada.opts.detached, true);
  assert.equal(filho.chamada.opts.env.CODEX_HOME, '/conta');
  assert.equal(filho.chamada.opts.env.A, '1');
  assert.ok(!filho.chamada.args.join(' ').includes('faça'));
  assert.deepEqual(fs.readdirSync(amb.tmp), [], 'temporário removido');
});

test('executar ok: resumo longo é cortado', async () => {
  const amb = ambiente();
  amb.deps.spawn = filhoFalso({
    aoIniciar: (f) => fs.writeFileSync(f.chamada.args[f.chamada.args.indexOf('-o') + 1], 'x'.repeat(20005)),
  });
  const r = await executar(base, amb.deps);
  assert.equal(r.resultado.resumo, 'x'.repeat(20000) + ' [cortado]');
});

test('executar --escrever lista os arquivos alterados', async () => {
  const amb = ambiente();
  amb.status.atual = ' M velho.js\n';
  amb.deps.spawn = filhoFalso({ aoIniciar: () => { amb.status.atual = ' M velho.js\n?? novo.js\n'; } });
  const r = await executar({ ...base, escrever: true }, amb.deps);
  assert.equal(r.codigo, 0);
  assert.equal(r.resultado.sandbox, 'workspace-write');
  assert.deepEqual(r.resultado.arquivos, ['novo.js']);
});

test('executar exit != 0: codigo 1 com o fim do stderr', async () => {
  const amb = ambiente();
  amb.deps.spawn = filhoFalso({ code: 7, stderr: 'a'.repeat(3000) + 'FIM' });
  const r = await executar(base, amb.deps);
  assert.equal(r.codigo, 1);
  assert.equal(r.resultado.status, 'erro');
  assert.equal(r.resultado.exit_code, 7);
  assert.ok(r.resultado.resumo.length <= 2000);
  assert.ok(r.resultado.resumo.endsWith('FIM'));
  assert.deepEqual(fs.readdirSync(amb.tmp), []);
});

test('executar ENOENT e EACCES: codigo 3', async () => {
  for (const erro of ['ENOENT', 'EACCES']) {
    const amb = ambiente();
    amb.deps.spawn = filhoFalso({ erro });
    const r = await executar(base, amb.deps);
    assert.equal(r.codigo, 3, erro);
    assert.equal(r.resultado.status, 'indisponivel');
    assert.deepEqual(fs.readdirSync(amb.tmp), []);
  }
});

test('executar spawn que lança ENOENT: codigo 3', async () => {
  const amb = ambiente();
  amb.deps.spawn = () => { throw Object.assign(new Error('x'), { code: 'ENOENT' }); };
  assert.equal((await executar(base, amb.deps)).codigo, 3);
});

test('executar escrever em repo não-git: codigo 2 sem iniciar o filho', async () => {
  const amb = ambiente({ git: () => null });
  let iniciou = false;
  amb.deps.spawn = () => { iniciou = true; };
  const r = await executar({ ...base, escrever: true }, amb.deps);
  assert.equal(r.codigo, 2);
  assert.equal(r.resultado.status, 'uso');
  assert.equal(iniciou, false);
});

test('executar read-only em repo não-git usa --skip-git-repo-check', async () => {
  const amb = ambiente({ git: () => null });
  let args;
  amb.deps.spawn = (b, a, o) => { args = a; return filhoFalso()(b, a, o); };
  assert.equal((await executar(base, amb.deps)).codigo, 0);
  assert.ok(args.includes('--skip-git-repo-check'));
});

test('executar timeout: SIGTERM ao grupo, SIGKILL depois da graça, codigo 4', async () => {
  const amb = ambiente({ gracaKillMs: 30 });
  amb.deps.spawn = filhoFalso({ fechar: false });
  const r = await executar({ ...base, timeout: 0.02 }, amb.deps);
  assert.equal(r.codigo, 4);
  assert.equal(r.resultado.status, 'timeout');
  assert.deepEqual(amb.kills, [[-4242, 'SIGTERM'], [-4242, 'SIGKILL']]);
  assert.deepEqual(fs.readdirSync(amb.tmp), []);
});

test('executar timeout: filho que morre no SIGTERM não recebe SIGKILL', async () => {
  const amb = ambiente({ gracaKillMs: 200 });
  amb.deps.spawn = filhoFalso({ fechar: false, aoIniciar: (f) => {
    amb.deps.kill = (pid, sinal) => { amb.kills.push([pid, sinal]); f.fechar(null, sinal); };
  } });
  const r = await executar({ ...base, timeout: 0.02 }, { ...amb.deps, kill: (p, s) => amb.deps.kill(p, s) });
  assert.equal(r.codigo, 4);
  assert.deepEqual(amb.kills, [[-4242, 'SIGTERM']]);
});
