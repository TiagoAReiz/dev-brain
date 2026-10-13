import { spawn, execFile } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export class DiaError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface Projeto {
  dir: string;
  memoria: string;
  novaMemoria: boolean;
  prompt: string | null;
}
export interface Repo { repo: string; nome: string; temMemoria: boolean; local: boolean }
export interface ResumoCLI {
  repos: { nome: string; dir: string; pendente: number; commits: number; riscos: string[] }[];
  memoria: { mudancas: number; commits: number };
  avulsos: string[];
}
export interface RelatorioCLI {
  salvos: string[];
  mantidos: { nome: string; motivo: string }[];
  memoria: { salva: boolean; motivo: string | null };
}
export type ProjectRunner = (args: string[]) => Promise<unknown>;

/** Setup fornece DEV_BRAIN_HOME; sem ele o WorkingDirectory é a pasta habblaud. */
export function devbrainRoot(env: NodeJS.ProcessEnv = process.env, workingDirectory = process.cwd()): string {
  if (env.DEV_BRAIN_HOME) {
    if (!isAbsolute(env.DEV_BRAIN_HOME)) throw new DiaError(503, 'DEV_BRAIN_HOME precisa ser um caminho absoluto');
    return resolve(env.DEV_BRAIN_HOME);
  }
  return dirname(resolve(workingDirectory));
}

/** Nunca usa shell; stdin fechado, saída e duração limitadas. */
export function createProjectRunner(root: string, env: NodeJS.ProcessEnv = process.env, limits: { timeoutMs?: number; killGraceMs?: number; maxOutputBytes?: number } = {}): ProjectRunner {
  return (args) => new Promise((ok, fail) => {
    const child = spawn(join(root, 'bin/project'), args, { cwd: root, env: { ...env, DEV_BRAIN_HOME: root, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const out: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let exceeded = false;
    let expired = false;
    let termination: Promise<void> | undefined;
    const signalGroup = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
      }
    };
    const terminate = () => {
      if (termination) return;
      termination = (async () => {
        if (process.platform === 'win32' && child.pid) {
          // /T includes children: killing only project could leave git/gh still writing.
          await new Promise<void>((done, reject) => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: 5000 }, (err) => err ? reject(err) : done()));
        } else {
          signalGroup('SIGTERM');
          await new Promise<void>((done) => setTimeout(done, limits.killGraceMs ?? 1000));
          signalGroup('SIGKILL');
        }
      })();
      // A failed termination keeps an actionable failure without an unhandled rejection.
      termination.catch(() => {});
    };
    const timer = setTimeout(() => { expired = true; terminate(); }, limits.timeoutMs ?? 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > (limits.maxOutputBytes ?? 2 * 1024 * 1024)) { exceeded = true; terminate(); }
      else out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-8192); });
    child.on('error', () => { clearTimeout(timer); fail(new DiaError(503, 'não consegui executar bin/project; confira o caminho e as permissões do dev-brain')); });
    child.on('close', async (code) => {
      clearTimeout(timer);
      try { await termination; } catch { return fail(new DiaError(502, 'não consegui encerrar project e seus subprocessos; encerre-os manualmente antes de tentar novamente')); }
      if (expired) return fail(new DiaError(504, 'project excedeu o tempo limite; confira os projetos preservados antes de tentar novamente'));
      if (exceeded) return fail(new DiaError(502, 'project devolveu dados demais; reduza a lista e tente novamente'));
      if (code !== 0) return fail(new DiaError(502, scrubProjectError(stderr, env) || 'project falhou; confira o login com gh auth status e execute o comando no terminal para ver os detalhes'));
      try { ok(JSON.parse(Buffer.concat(out).toString('utf8'))); }
      catch { fail(new DiaError(502, 'project não devolveu JSON válido; atualize o dev-brain e tente novamente')); }
    });
  });
}

/** Grava fora dos projetos, com rename atômico e permissões privadas. */
export function createReportPersistence(dataDir = process.env.HABBLAUD_DATA_DIR || join(homedir(), '.habblaud')): (report: RelatorioCLI) => Promise<string> {
  return async (report) => {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const path = join(dataDir, 'ultimo-dia.json');
    const temp = join(dataDir, `.ultimo-dia-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      await rename(temp, path);
      return path;
    } finally { await rm(temp, { force: true }); }
  };
}

/** Preserva os erros úteis da CLI, removendo credenciais conhecidas e formatos comuns. */
export function scrubProjectError(raw: string, env: NodeJS.ProcessEnv): string {
  let text = raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  for (const [key, value] of Object.entries(env)) {
    if (value && value.length >= 4 && /(?:TOKEN|PASSWORD|SECRET|CREDENTIAL)/i.test(key)) text = text.split(value).join('[credencial removida]');
  }
  return text.replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[credencial removida]@')
    .replace(/(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)/g, '[credencial removida]')
    .replace(/((?:token|password|secret|access_token|api_key)=)[^&\s]+/gi, '$1[credencial removida]')
    .replace(/(authorization:\s*(?:bearer|basic)\s+)[^\s]+/gi, '$1[credencial removida]')
    .trim().slice(-2048);
}
