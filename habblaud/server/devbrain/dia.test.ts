import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { AgentInfo, OfficeSnapshot, PtyInfo } from '../../shared/types';
import { DiaService, parseIniciar, type DiaDeps } from './dia';
import { createProjectRunner, createReportPersistence, devbrainRoot, scrubProjectError } from './project';
import { mkdirSync } from 'node:fs';

const project = { dir: '/tmp/day-work/projeto', memoria: 'projeto', novaMemoria: true, prompt: 'Kickoff literal' };
const cliSummary = { repos: [], memoria: { mudancas: 2, commits: 1 }, avulsos: ['readme'] };
const report = { salvos: ['projeto'], mantidos: [{ nome: 'seguro', motivo: '.env' }], memoria: { salva: true, motivo: null } };
const pty: PtyInfo = { id: 'p1-44', agentId: 'acc:44', pid: 44, cwd: '/tmp/day-work/projeto', account: 'acc', startedAt: 1 };
const agent = (over: Partial<AgentInfo> = {}): AgentInfo => ({ id: 'acc:44', kind: 'main', account: 'acc', name: 'Marina', status: 'working', roomId: 'room', ...over } as AgentInfo);
function setup(over: Partial<DiaDeps> = {}) {
  const runner = vi.fn(async (args: string[]) => args[0] === 'resumo' ? cliSummary : args[0] === 'repos' ? [] : args[0] === 'exit' ? report : project);
  const stopAndWait = vi.fn(async () => {});
  const create = vi.fn(() => pty);
  const persist = vi.fn(async () => '/tmp/day-data/ultimo-dia.json');
  const shutdown = vi.fn();
  const schedule = vi.fn();
  const deps: DiaDeps = { runner, ptys: { status: () => ({ enabled: true }), list: () => [], create, stopAndWait }, snapshot: () => ({ agents: [], rooms: [] }), isReal: () => true, persist, shutdown, schedule, workfolder: '/tmp/day-work', ...over };
  return { service: new DiaService(deps), deps, runner, stopAndWait, create, persist, shutdown, schedule };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

describe('DiaService: iniciar', () => {
  it.each([null, [], {}, { repo: '../evil' }, { repo: '-option/projeto' }, { repo: 'a/b/c' }, { repo: 'a/b', nome: 'foo' }, { nome: 'Maiúscula' }, { nome: 'foo', visibilidade: 'danger' }, { nome: 'foo', extra: true }])('recusa corpo %j antes de mutar', async (body) => {
    const s = setup();
    await expect(s.service.iniciar(body)).rejects.toMatchObject({ status: 400 });
    expect(s.runner).not.toHaveBeenCalled();
  });
  it.each(['qa/_repo', 'qa/repo-', 'qa/repo.name_', 'a'.repeat(39) + '/' + 'b'.repeat(100)])('aceita nome GitHub válido %s', (repo) => {
    expect(parseIniciar({ repo })).toEqual({ repo });
  });
  it.each(['qa/..', 'qa/.', '../repo', 'a'.repeat(40) + '/repo', 'qa/' + 'b'.repeat(101), 'qa/repo/extra'])('recusa traversal ou argumento longo %s', (repo) => {
    expect(() => parseIniciar({ repo })).toThrow();
  });
  it('repositório é argumento literal; prompt abre uma única sessão', async () => {
    const s = setup();
    await expect(s.service.iniciar({ repo: 'TiagoAReiz/dev-brain' })).resolves.toEqual({ projeto: project, pty });
    expect(s.runner).toHaveBeenCalledWith(['preparar', 'TiagoAReiz/dev-brain', '--json']);
    expect(s.create).toHaveBeenCalledExactlyOnceWith({ cwd: project.dir, prompt: project.prompt });
  });
  it('novo projeto é privado por padrão; público explícito funciona', async () => {
    const s = setup();
    await s.service.iniciar({ nome: 'novo-projeto' });
    expect(s.runner).toHaveBeenLastCalledWith(['create', 'novo-projeto', '--private', '--sem-claude', '--json']);
    await s.service.iniciar({ nome: 'novo', visibilidade: 'public' });
    expect(s.runner).toHaveBeenLastCalledWith(['create', 'novo', '--public', '--sem-claude', '--json']);
  });
  it('projeto com memória abre sem prompt', async () => {
    const s = setup({ runner: async () => ({ ...project, novaMemoria: false, prompt: null }) });
    await s.service.iniciar({ repo: 'a/b' });
    expect(s.create).toHaveBeenCalledExactlyOnceWith({ cwd: project.dir });
  });
  it('terminal indisponível é verificado antes da CLI', async () => {
    const s = setup();
    s.deps.ptys.status = () => ({ enabled: false, reason: 'node-pty' });
    await expect(s.service.iniciar({ nome: 'novo' })).rejects.toMatchObject({ status: 403 });
    expect(s.runner).not.toHaveBeenCalled();
  });
  it('falha de spawn mostra pasta recuperável, sem desfazer projeto', async () => {
    const s = setup();
    s.create.mockImplementation(() => { throw Error('raw secret'); });
    await expect(s.service.iniciar({ nome: 'novo' })).rejects.toThrow(project.dir);
    expect(s.runner).toHaveBeenCalledTimes(1);
  });
  it('inícios concorrentes e finalizar durante início são recusados', async () => {
    const gate = deferred<unknown>();
    const s = setup({ runner: () => gate.promise });
    const first = s.service.iniciar({ nome: 'primeiro' });
    await expect(s.service.iniciar({ nome: 'segundo' })).rejects.toMatchObject({ status: 409 });
    await expect(s.service.finalizar()).rejects.toMatchObject({ status: 409 });
    gate.resolve(project);
    await first;
  });
});

describe('DiaService: resumo e finalizar', () => {
  it('inclui PTY antes do registro, deduplica Claude e informa não gerenciados', async () => {
    const s = setup({ snapshot: () => ({ agents: [agent(), agent({ id: 'acc:55', name: 'João' }), agent({ id: 'codex:aa', provider: 'codex' }), agent({ id: 'sub', kind: 'sub' }), agent({ id: 'demo:12' }), agent({ id: 'acc:99', status: 'offline' })], rooms: [{ id: 'room', path: '/tmp/day-work/projeto' }] } as OfficeSnapshot), isReal: (id) => !id.startsWith('demo:') });
    s.deps.ptys.list = () => [pty, { ...pty, id: 'p2', agentId: 'acc:66', pid: 66 }];
    const summary = await s.service.resumo();
    expect(summary.sessoes.map((v) => v.id)).toEqual(['acc:44', 'acc:66', 'acc:55']);
    expect(summary.naoGerenciadas.map((v) => v.id)).toEqual(['codex:aa', 'demo:12']);
    expect(summary.avulsos).toEqual(['readme']);
    expect(s.stopAndWait).not.toHaveBeenCalled();
  });
  it('espera sessões antes de salvar; persiste antes de agendar shutdown', async () => {
    const gate = deferred<void>();
    const s = setup();
    s.deps.ptys.list = () => [pty];
    s.stopAndWait.mockImplementation(() => gate.promise);
    const run = s.service.finalizar();
    expect(s.service.isFinalizing).toBe(true);
    expect(s.runner).not.toHaveBeenCalled();
    await expect(s.service.iniciar({ nome: 'outro' })).rejects.toMatchObject({ status: 409 });
    gate.resolve();
    const result = await run;
    expect(s.runner).toHaveBeenCalledExactlyOnceWith(['exit', '--sem-perguntas', '--json']);
    expect(s.persist).toHaveBeenCalledWith(report);
    expect(result).toEqual({ ...report, relatorioPath: '/tmp/day-data/ultimo-dia.json', desligaEm: 5 });
    expect(s.schedule).not.toHaveBeenCalled();
    s.service.scheduleShutdown();
    s.service.scheduleShutdown();
    expect(s.schedule).toHaveBeenCalledTimes(1);
    expect(s.schedule.mock.calls[0][1]).toBe(5000);
    s.schedule.mock.calls[0][0]();
    await Promise.resolve();
    expect(s.shutdown).toHaveBeenCalledOnce();
  });
  it('finalizações simultâneas compartilham promise e sucesso é idempotente', async () => {
    const s = setup();
    const a = s.service.finalizar();
    expect(s.service.finalizar()).toBe(a);
    const result = await a;
    expect(await s.service.finalizar()).toBe(result);
    expect(s.runner).toHaveBeenCalledTimes(1);
    expect(s.persist).toHaveBeenCalledTimes(1);
  });
  it('falha ao encerrar aborta toda limpeza; retém alvo para retry', async () => {
    const s = setup();
    s.deps.ptys.list = () => [pty];
    s.stopAndWait.mockRejectedValueOnce(Error('still writing'));
    await expect(s.service.finalizar()).rejects.toMatchObject({ status: 502 });
    expect(s.runner).not.toHaveBeenCalled();
    expect(s.persist).not.toHaveBeenCalled();
    s.deps.ptys.list = () => [];
    await s.service.finalizar();
    expect(s.stopAndWait).toHaveBeenCalledTimes(2);
  });
  it('falha de persistência não desliga; retry não repete exit', async () => {
    const s = setup();
    s.persist.mockRejectedValueOnce(Error('ENOSPC secret'));
    await expect(s.service.finalizar()).rejects.toThrow('relatório');
    s.service.scheduleShutdown();
    expect(s.schedule).not.toHaveBeenCalled();
    expect(s.service.isFinalizing).toBe(true);
    await s.service.finalizar();
    expect(s.runner).toHaveBeenCalledTimes(1);
    expect(s.persist).toHaveBeenCalledTimes(2);
  });
  it('recalcula sessões no confirmar, não usa resumo anterior', async () => {
    const s = setup();
    await s.service.resumo();
    s.deps.ptys.list = () => [pty];
    await s.service.finalizar();
    expect(s.stopAndWait).toHaveBeenCalledWith(pty.agentId);
  });
  it('não encerra demo, subagente nem Codex fora do workfolder', async () => {
    const s = setup({ snapshot: () => ({ agents: [agent({ id: 'demo:12' }), agent({ id: 'codex:aa', provider: 'codex' }), agent({ id: 'sub', kind: 'sub' })], rooms: [{ id: 'room', path: '/tmp/dev-brain' }] } as OfficeSnapshot), isReal: (id) => !id.startsWith('demo:') });
    await s.service.finalizar();
    expect(s.stopAndWait).not.toHaveBeenCalled();
  });
  it.each(['/tmp/day-work/projeto', undefined])('Codex com cwd inseguro %j bloqueia antes dos sinais e exit', async (cwd) => {
    const s = setup({ snapshot: () => ({ agents: [agent({ id: 'codex:aa', provider: 'codex' })], rooms: cwd ? [{ id: 'room', path: cwd }] : [] } as OfficeSnapshot) });
    await expect(s.service.finalizar()).rejects.toMatchObject({ status: 409 });
    expect(s.runner).not.toHaveBeenCalled();
    expect(s.stopAndWait).not.toHaveBeenCalled();
  });
  it.each([{}, { repos: [], memoria: { mudancas: -1, commits: 0 }, avulsos: [] }])('dados incompletos da CLI falham sem inventar contagem zero', async (data) => {
    const s = setup({ runner: async () => data });
    await expect(s.service.resumo()).rejects.toMatchObject({ status: 502 });
  });
});

describe('project runner e persistência isolados', () => {
  it('resolve DEV_BRAIN_HOME e WorkingDirectory sem depender do shell', () => {
    expect(devbrainRoot({}, '/tmp/dev-brain/habblaud')).toBe('/tmp/dev-brain');
    expect(devbrainRoot({ DEV_BRAIN_HOME: '/other' }, '/tmp/anything')).toBe('/other');
    expect(() => devbrainRoot({ DEV_BRAIN_HOME: '../relative' })).toThrow(/absoluto/);
    expect(parseIniciar({ nome: 'meu-projeto' })).toEqual({ nome: 'meu-projeto', visibilidade: undefined });
  });
  it('grava relatório atômico privado fora do workfolder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbrain-report-'));
    try {
      const persist = createReportPersistence(join(dir, 'dados'));
      const path = await persist(report);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(report);
      await persist({ ...report, salvos: [] });
      expect(JSON.parse(readFileSync(path, 'utf8')).salvos).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.runIf(process.platform !== 'win32')('runner executa args literais, fecha stdin, preserva erros úteis sem tokens', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbrain-runner-'));
    try {
      mkdirSync(join(dir, 'bin'));
      const file = join(dir, 'bin/project');
      writeFileSync(file, `#!/usr/bin/env node\nif(process.argv[2]==='fail'){process.stderr.write('clone falhou em /tmp/projeto https://user:secret@example.com x='+process.env.GH_TOKEN);process.exit(1)} process.stdin.on('end',()=>process.stdout.write(JSON.stringify(process.argv.slice(2))));process.stdin.resume();\n`);
      chmodSync(file, 0o755);
      const runner = createProjectRunner(dir, { ...process.env, GH_TOKEN: 'super-private-token' });
      await expect(runner(['$(touch nope)', '--json'])).resolves.toEqual(['$(touch nope)', '--json']);
      await expect(runner(['fail'])).rejects.toThrow(/clone falhou em \/tmp\/projeto/);
      const error = await runner(['fail']).catch((e: Error) => e.message);
      expect(error).not.toContain('super-private-token');
      expect(error).not.toContain('user:secret');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it.runIf(process.platform !== 'win32')('timeout encerra descendentes antes de liberar o runner', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'devbrain-timeout-'));
    try {
      mkdirSync(join(dir, 'bin'));
      const child = join(dir, 'writer.cjs');
      const marker = join(dir, 'unsafe-writer');
      writeFileSync(child, `process.on('SIGTERM',()=>{}); setTimeout(()=>require('node:fs').writeFileSync(process.argv[2],'written'),500); setInterval(()=>{},1000);`);
      const file = join(dir, 'bin/project');
      writeFileSync(file, `#!/usr/bin/env node\nrequire('node:child_process').spawn(process.execPath, [${JSON.stringify(child)},${JSON.stringify(marker)}],{stdio:'ignore'});setInterval(()=>{},1000);\n`);
      chmodSync(file, 0o755);
      const runner = createProjectRunner(dir, process.env, { timeoutMs: 100, killGraceMs: 20 });
      await expect(runner(['resumo', '--json'])).rejects.toMatchObject({ status: 504 });
      await new Promise((ok) => setTimeout(ok, 550));
      expect(() => readFileSync(marker)).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('redige formatos comuns sem ocultar caminho acionável', () => {
    const raw = 'ghp_abc github_pat_xyz https://user:pass@github.com access_token=shhh Authorization: Bearer abc123 clone falhou em /tmp/app';
    const safe = scrubProjectError(raw, {});
    expect(safe).toContain('clone falhou em /tmp/app');
    for (const secret of ['ghp_abc', 'github_pat_xyz', 'user:pass', 'shhh', 'abc123']) expect(safe).not.toContain(secret);
  });
});
