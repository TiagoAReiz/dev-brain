'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'codex-agente');

// `codex` falso: grava stdin, CODEX_HOME e argv; escreve no arquivo do -o; altera um arquivo no cwd
// se FAKE_ALTERA; sai com erro se FAKE_ERRO. Nunca chama o Codex de verdade.
const FALSO = `#!/bin/sh
cat > "$FAKE_DIR/stdin.txt"
printf '%s' "$CODEX_HOME" > "$FAKE_DIR/codex_home.txt"
printf '%s\\n' "$@" > "$FAKE_DIR/args.txt"
saida=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then saida="$2"; fi
  shift
done
printf 'resposta do falso\\n' > "$saida"
if [ -n "$FAKE_ALTERA" ]; then echo x > alterado.txt; fi
if [ -n "$FAKE_ERRO" ]; then echo "$FAKE_ERRO" >&2; exit 1; fi
exit 0
`;

// Cria um diretório temporário com o codex falso e um repo vazio; remove tudo ao final de `fn`.
function comAmbiente(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cli-'));
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  const bin = path.join(dir, 'codex');
  fs.writeFileSync(bin, FALSO);
  fs.chmodSync(bin, 0o755);
  try {
    return fn({ dir, repo, bin });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function rodar(ambiente, args, { input = '', env = {} } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, FAKE_DIR: ambiente.dir, CODEX_BIN: ambiente.bin, CODEX_HOME: '', FAKE_ALTERA: '', FAKE_ERRO: '', ...env },
  });
}

// stdout tem que ser exatamente uma linha de JSON.
function jsonDeUmaLinha(r) {
  const linhas = r.stdout.split('\n');
  assert.equal(linhas.length, 2, `stdout: ${JSON.stringify(r.stdout)}`);
  assert.equal(linhas[1], '');
  return JSON.parse(linhas[0]);
}

const lerFalso = (ambiente, nome) => fs.readFileSync(path.join(ambiente.dir, nome), 'utf8');

test('ok: resumo vem do arquivo do -o e a saída é uma linha de JSON', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--repo', amb.repo, 'faça X']);
  assert.equal(r.status, 0, r.stderr);
  const j = jsonDeUmaLinha(r);
  assert.equal(j.status, 'ok');
  assert.equal(j.resumo, 'resposta do falso');
  assert.equal(j.exit_code, 0);
  assert.equal(j.sandbox, 'read-only');
  assert.deepEqual(j.arquivos, []);
  assert.equal(typeof j.duracao_s, 'number');
}));

test('prompt do argumento chega ao codex pelo stdin', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--repo', amb.repo, 'faça X']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lerFalso(amb, 'stdin.txt'), 'faça X');
  assert.ok(lerFalso(amb, 'args.txt').split('\n').includes('-'));
}));

test('prompt sem argumento é lido do stdin', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--repo', amb.repo], { input: 'pedido vindo do stdin' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lerFalso(amb, 'stdin.txt'), 'pedido vindo do stdin');
}));

test('--codex-home chega ao filho como CODEX_HOME', () => comAmbiente((amb) => {
  const home = path.join(amb.dir, 'conta-2');
  const r = rodar(amb, ['--repo', amb.repo, '--codex-home', home, 'oi']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(lerFalso(amb, 'codex_home.txt'), home);
}));

test('exit != 0 do filho: exit 1, status erro e stderr no resumo', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--repo', amb.repo, 'oi'], { env: { FAKE_ERRO: 'boom: falhou' } });
  assert.equal(r.status, 1);
  const j = jsonDeUmaLinha(r);
  assert.equal(j.status, 'erro');
  assert.equal(j.exit_code, 1);
  assert.match(j.resumo, /boom: falhou/);
}));

test('CODEX_BIN inexistente: exit 3 e status indisponivel', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--repo', amb.repo, 'oi'], { env: { CODEX_BIN: path.join(amb.dir, 'nao-existe') } });
  assert.equal(r.status, 3);
  const j = jsonDeUmaLinha(r);
  assert.equal(j.status, 'indisponivel');
  assert.equal(j.exit_code, 3);
}));

test('uso inválido: flag desconhecida dá exit 2 e JSON de uso', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--nada', 'oi']);
  assert.equal(r.status, 2);
  const j = jsonDeUmaLinha(r);
  assert.equal(j.status, 'uso');
  assert.equal(j.exit_code, 2);
  assert.match(r.stderr, /--nada/);
}));

test('uso inválido: prompt vazio (sem argumento e stdin vazio) dá exit 2', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--repo', amb.repo], { input: '' });
  assert.equal(r.status, 2);
  assert.equal(jsonDeUmaLinha(r).status, 'uso');
}));

test('--ajuda imprime texto de ajuda e sai com 0', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--ajuda']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--escrever/);
  assert.equal(fs.existsSync(path.join(amb.dir, 'args.txt')), false);
}));

test('--escrever em repo git: sandbox workspace-write e lista o arquivo alterado pelo falso', () => comAmbiente((amb) => {
  const git = spawnSync('git', ['init', '-q', amb.repo], { encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  const r = rodar(amb, ['--repo', amb.repo, '--escrever', 'edite'], { env: { FAKE_ALTERA: '1' } });
  assert.equal(r.status, 0, r.stderr);
  const j = jsonDeUmaLinha(r);
  assert.equal(j.status, 'ok');
  assert.equal(j.sandbox, 'workspace-write');
  assert.deepEqual(j.arquivos, ['alterado.txt']);
  assert.ok(lerFalso(amb, 'args.txt').split('\n').includes('workspace-write'));
}));

test('--escrever em pasta que não é git: uso inválido, exit 2', () => comAmbiente((amb) => {
  const r = rodar(amb, ['--repo', amb.repo, '--escrever', 'edite']);
  assert.equal(r.status, 2);
  const j = jsonDeUmaLinha(r);
  assert.equal(j.status, 'uso');
  assert.match(j.resumo, /git/);
}));
