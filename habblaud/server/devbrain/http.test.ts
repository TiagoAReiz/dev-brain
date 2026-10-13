import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiaService } from './dia';
import { createDevbrainRoutes } from './http';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }))); });
async function setup(opts: { remote?: boolean; disabled?: boolean; runner?: (args: string[]) => Promise<unknown> } = {}) {
  const runner = vi.fn(opts.runner ?? (async (args) => args[0] === 'exit' ? { salvos: [], mantidos: [], memoria: { salva: true, motivo: null } } : args[0] === 'resumo' ? { repos: [], memoria: { mudancas: 0, commits: 0 }, avulsos: [] } : args[0] === 'repos' ? [] : { dir: '/tmp/demo', memoria: 'demo', novaMemoria: false, prompt: null }));
  const schedule = vi.fn();
  const service = new DiaService({ runner, ptys: { status: () => ({ enabled: !opts.disabled }), list: () => [], create: () => ({ id: 'p1', pid: 42, agentId: 'acc:42', account: 'acc', cwd: '/tmp/demo', startedAt: 1 }), stopAndWait: async () => {} }, snapshot: () => ({ agents: [], rooms: [] }), isReal: () => true, persist: async () => '/tmp/ultimo-dia.json', shutdown: vi.fn(), schedule });
  const routes = createDevbrainRoutes(service, { isRemote: () => opts.remote ?? false });
  const server = createServer((req, res) => routes(req, res, new URL(req.url!, 'http://localhost').pathname));
  servers.push(server);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, init?: RequestInit) => fetch(base + '/api/devbrain/' + path, init);
  const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { service, runner, schedule, call, post, base, routes };
}

describe('rotas do ciclo do dia', () => {
  it('GET repos e resumo; POST iniciar201 e finalizar200', async () => {
    const s = await setup();
    expect((await s.call('repos')).status).toBe(200);
    const summary = await s.call('resumo');
    expect(await summary.json()).toMatchObject({ sessoes: [], naoGerenciadas: [] });
    const started = await s.call('iniciar', s.post({ repo: 'owner/repo' }));
    expect(started.status).toBe(201);
    expect(await started.json()).toMatchObject({ projeto: { dir: '/tmp/demo' }, pty: { id: 'p1' } });
    const finalized = await s.call('finalizar', s.post({}));
    expect(finalized.status).toBe(200);
    expect(await finalized.json()).toMatchObject({ desligaEm: 5, relatorioPath: '/tmp/ultimo-dia.json' });
    expect(s.schedule).toHaveBeenCalledTimes(1);
  });
  it.each(['repos', 'resumo', 'iniciar', 'finalizar'])('recusa acesso remoto em %s mesmo com Host loopback', async (route) => {
    const s = await setup({ remote: true });
    expect((await s.call(route, route === 'repos' || route === 'resumo' ? undefined : s.post({}))).status).toBe(403);
    expect(s.runner).not.toHaveBeenCalled();
  });
  it.each(['repos', 'resumo', 'iniciar', 'finalizar'])('terminal desligado recusa %s', async (route) => {
    const s = await setup({ disabled: true });
    expect((await s.call(route)).status).toBe(403);
    expect(s.runner).not.toHaveBeenCalled();
  });
  it('Host não local e Origin de outro site são recusados inclusive GET', async () => {
    const s = await setup();
    const hostStatus = await new Promise<number>((ok, fail) => { const req = request(s.base + '/api/devbrain/repos', { headers: { host: 'external.example' } }, (res) => { res.resume(); ok(res.statusCode!); }); req.on('error', fail); req.end(); });
    expect(hostStatus).toBe(403);
    expect((await s.call('resumo', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await s.call('repos', { headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
    expect(s.runner).not.toHaveBeenCalled();
  });
  it('endereços não loopback são recusados antes do serviço', async () => {
    const s = await setup();
    let status = 0;
    const req = { headers: { host: 'localhost' }, socket: { remoteAddress: '192.168.1.5' }, method: 'GET' } as IncomingMessage;
    const res = { headersSent: false, writeHead: (code: number) => { status = code; }, end: vi.fn() } as unknown as ServerResponse;
    s.routes(req, res, '/api/devbrain/repos');
    await Promise.resolve();
    expect(status).toBe(403);
    expect(s.runner).not.toHaveBeenCalled();
  });
  it.each(['repos', 'resumo', 'iniciar', 'finalizar'])('método incorreto em %s devolve405+Allow', async (route) => {
    const s = await setup();
    const expected = route === 'repos' || route === 'resumo' ? 'GET' : 'POST';
    const response = await s.call(route, { method: expected === 'GET' ? 'DELETE' : 'GET' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe(expected);
    expect(s.runner).not.toHaveBeenCalled();
  });
  it('exige JSON, recusa JSON inválido/corpo extra/array e rota inexistente', async () => {
    const s = await setup();
    expect((await s.call('iniciar', { method: 'POST', body: '{}' })).status).toBe(415);
    expect((await s.call('iniciar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'bad' })).status).toBe(400);
    for (const body of [null, [], { confirm: true }]) expect((await s.call('finalizar', s.post(body))).status).toBe(400);
    expect((await s.call('iniciar', s.post({ repo: '../bad' }))).status).toBe(400);
    expect((await s.call('missing')).status).toBe(404);
    expect(s.runner).not.toHaveBeenCalled();
  });
  it('erro inesperado não vaza segredo', async () => {
    const s = await setup({ runner: async () => { throw Error('github_pat_secret'); } });
    const res = await s.call('repos');
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('github_pat_secret');
  });
  it('duplo finalizar não duplica CLI nem shutdown', async () => {
    const s = await setup();
    const responses = await Promise.all([s.call('finalizar', s.post({})), s.call('finalizar', s.post({}))]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(s.runner).toHaveBeenCalledTimes(1);
    expect(s.schedule).toHaveBeenCalledTimes(1);
  });
  it('desconectar durante finalização não cancela nem impede shutdown', async () => {
    let finish!: (value: unknown) => void;
    let ran!: () => void;
    const started = new Promise<void>((ok) => { ran = ok; });
    const s = await setup({ runner: () => { ran(); return new Promise((ok) => { finish = ok; }); } });
    const req = request(s.base + '/api/devbrain/finalizar', { method: 'POST', headers: { 'content-type': 'application/json' } });
    req.on('error', () => {});
    req.end('{}');
    await started;
    req.destroy();
    await new Promise((ok) => setTimeout(ok, 20));
    finish({ salvos: [], mantidos: [], memoria: { salva: true, motivo: null } });
    await vi.waitFor(() => expect(s.schedule).toHaveBeenCalledTimes(1));
    expect(s.service.isFinalizing).toBe(true);
  });
});
