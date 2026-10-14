'use strict';
// codex-agente: roda o `codex exec` não interativo num repo e devolve um resultado curto.
// Lógica; o bin/codex-agente só faz I/O.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const TIMEOUT_PADRAO = 900;
const TIMEOUT_MAX = 7200;
const LIMITE_RESUMO = 20000;
const LIMITE_ERRO = 2000;
const GRACA_KILL_MS = 5000;

function parseArgs(argv) {
  const opcoes = { prompt: null, repo: process.cwd(), escrever: false, timeout: TIMEOUT_PADRAO, modelo: null, codexHome: null };
  const posicionais = [];
  const valor = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v === '' || (v.startsWith('--') && v.length > 2)) return { erro: `${flag} exige um valor` };
    return { v };
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      posicionais.push(...argv.slice(i + 1));
      break;
    }
    if (a === '--ajuda') return { ok: false, ajuda: true, erro: 'ajuda solicitada' };
    if (a === '--escrever') {
      opcoes.escrever = true;
    } else if (a === '--repo' || a === '--timeout' || a === '--modelo' || a === '--codex-home') {
      const r = valor(i, a);
      if (r.erro) return { ok: false, erro: r.erro };
      i++;
      if (a === '--repo') opcoes.repo = path.resolve(r.v);
      else if (a === '--modelo') opcoes.modelo = r.v;
      else if (a === '--codex-home') opcoes.codexHome = r.v;
      else {
        const n = /^\d+$/.test(r.v) ? Number(r.v) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > TIMEOUT_MAX) {
          return { ok: false, erro: `--timeout deve ser inteiro de 1 a ${TIMEOUT_MAX}` };
        }
        opcoes.timeout = n;
      }
    } else if (a === '-' || !a.startsWith('-')) {
      posicionais.push(a);
    } else {
      return { ok: false, erro: `opção desconhecida: ${a}` };
    }
  }
  if (posicionais.length > 1) return { ok: false, erro: 'informe um único prompt (use aspas ou o stdin)' };
  if (posicionais.length === 1 && posicionais[0] !== '-') opcoes.prompt = posicionais[0];
  return { ok: true, opcoes };
}

// argv do `codex exec`; o `-` final manda o prompt pelo stdin. Nunca emite danger-full-access.
function montarArgs(opcoes, arquivoSaida) {
  const args = ['exec', '-C', opcoes.repo, '-s', opcoes.escrever ? 'workspace-write' : 'read-only', '-o', arquivoSaida];
  if (opcoes.modelo) args.push('-m', opcoes.modelo);
  if (opcoes.repoNaoGit && !opcoes.escrever) args.push('--skip-git-repo-check');
  args.push('-');
  return args;
}

// Linhas novas de `depois` em relação a `antes` (git status --porcelain), sem o prefixo XY.
function arquivosAlterados(antes, depois) {
  const existentes = new Set(String(antes).split('\n').filter(Boolean));
  const saida = new Set();
  for (const linha of String(depois).split('\n')) {
    if (!linha || existentes.has(linha)) continue;
    let caminho = linha.slice(3);
    const seta = caminho.indexOf(' -> ');
    if (seta !== -1) caminho = caminho.slice(seta + 4);
    if (caminho) saida.add(caminho);
  }
  return [...saida].sort();
}

// git real: devolve o stdout ou null se o comando falhar.
function gitPadrao(repo, args) {
  const r = cp.spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return r.error || r.status !== 0 ? null : r.stdout;
}

const cortar = (texto, limite, sufixo = '') => (texto.length > limite ? texto.slice(0, limite) + sufixo : texto);

async function executar(opcoes, deps = {}) {
  const spawn = deps.spawn || cp.spawn;
  const bin = deps.bin || process.env.CODEX_BIN || 'codex';
  const env = deps.env || process.env;
  const git = deps.git || gitPadrao;
  const tmpdir = deps.tmpdir || os.tmpdir();
  const agora = deps.agora || (() => Date.now());
  const kill = deps.kill || process.kill;
  const graca = deps.gracaKillMs ?? GRACA_KILL_MS;

  const inicio = agora();
  const sandbox = opcoes.escrever ? 'workspace-write' : 'read-only';
  const fim = (codigo, status, resumo, extra = {}) => ({
    codigo,
    resultado: {
      status, resumo, arquivos: extra.arquivos || [], exit_code: extra.exit_code ?? codigo,
      duracao_s: Math.round(((agora() - inicio) / 1000) * 10) / 10, sandbox,
    },
  });

  const ehGit = git(opcoes.repo, ['rev-parse', '--is-inside-work-tree']) !== null;
  if (opcoes.escrever && !ehGit) return fim(2, 'uso', '--escrever exige um repositório git');

  const antes = ehGit ? git(opcoes.repo, ['status', '--porcelain']) || '' : '';
  const dir = fs.mkdtempSync(path.join(tmpdir, 'codex-agente-'));
  const arquivoSaida = path.join(dir, 'ultima-mensagem.txt');
  try {
    const args = montarArgs({ ...opcoes, repoNaoGit: !ehGit }, arquivoSaida);
    const envFilho = { ...env };
    if (opcoes.codexHome) envFilho.CODEX_HOME = opcoes.codexHome;

    const r = await new Promise((resolve) => {
      let pronto = false;
      let estourou = false;
      let stderr = '';
      let tTimeout = null;
      let tKill = null;
      const terminar = (v) => {
        if (pronto) return;
        pronto = true;
        clearTimeout(tTimeout);
        clearTimeout(tKill);
        resolve({ ...v, estourou, stderr });
      };
      let filho;
      try {
        filho = spawn(bin, args, { cwd: opcoes.repo, env: envFilho, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        terminar({ erro: e });
        return;
      }
      const grupo = (sinal) => {
        try { kill(-filho.pid, sinal); } catch { /* grupo já encerrado */ }
      };
      filho.on('error', (erro) => terminar({ erro }));
      filho.on('close', (code, signal) => terminar({ code, signal }));
      if (filho.stderr) filho.stderr.on('data', (d) => { stderr = (stderr + d).slice(-LIMITE_ERRO * 4); });
      if (filho.stdout) filho.stdout.on('data', () => {});
      if (filho.stdin) {
        filho.stdin.on('error', () => {});
        filho.stdin.end(opcoes.prompt ?? '');
      }
      tTimeout = setTimeout(() => {
        estourou = true;
        grupo('SIGTERM');
        tKill = setTimeout(() => {
          grupo('SIGKILL');
          terminar({ code: null, signal: 'SIGKILL' });
        }, graca);
      }, opcoes.timeout * 1000);
    });

    if (r.erro) {
      if (r.erro.code === 'ENOENT' || r.erro.code === 'EACCES') {
        return fim(3, 'indisponivel', `Codex indisponível (${r.erro.code}): ${bin}`);
      }
      return fim(1, 'erro', cortar(String(r.erro.message || r.erro), LIMITE_ERRO), { exit_code: 1 });
    }
    if (r.estourou) return fim(4, 'timeout', `Codex excedeu ${opcoes.timeout}s`, { exit_code: r.code ?? 124 });
    if (r.code !== 0) {
      const resumo = r.stderr.trim().slice(-LIMITE_ERRO) || `Codex terminou com código ${r.code ?? r.signal}`;
      return fim(1, 'erro', resumo, { exit_code: r.code ?? 1 });
    }
    let texto = '';
    try { texto = fs.readFileSync(arquivoSaida, 'utf8').trim(); } catch { /* sem mensagem final */ }
    const arquivos = opcoes.escrever ? arquivosAlterados(antes, git(opcoes.repo, ['status', '--porcelain']) || '') : [];
    return fim(0, 'ok', cortar(texto, LIMITE_RESUMO, ' [cortado]'), { arquivos, exit_code: 0 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { parseArgs, montarArgs, arquivosAlterados, executar };
