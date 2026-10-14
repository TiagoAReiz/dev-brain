import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ClienteHabblaud, parseSse } from './cliente';

const servidores: Server[] = [];

async function subir(h: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ url: string; server: Server }> {
  const server = createServer(h);
  servidores.push(server);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

afterEach(async () => {
  for (const s of servidores.splice(0)) {
    s.closeAllConnections();
    if (s.listening) await new Promise((ok) => s.close(ok));
  }
});

const esperar = async (cond: () => boolean) => {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(cond()).toBe(true);
};

describe('parseSse', () => {
  it('separa eventos e guarda o resto incompleto', () => {
    const r = parseSse('retry: 2000\n\nevent: snapshot\ndata: {"a":1}\n\nevent: feed\ndata: [');
    expect(r.eventos).toEqual([{ evento: 'snapshot', dados: '{"a":1}' }]);
    expect(r.resto).toBe('event: feed\ndata: [');
  });

  it('evento quebrado entre chunks', () => {
    const a = parseSse('event: snapshot\nda');
    expect(a.eventos).toEqual([]);
    const b = parseSse(a.resto + 'ta: {"x":2}\n');
    expect(b.eventos).toEqual([]);
    const c = parseSse(b.resto + '\nevent: notice\ndata: 1\n\n');
    expect(c.eventos).toEqual([
      { evento: 'snapshot', dados: '{"x":2}' },
      { evento: 'notice', dados: '1' },
    ]);
    expect(c.resto).toBe('');
  });

  it('junta várias linhas data:, ignora comentário e aceita CRLF', () => {
    const r = parseSse(': ping\n\nevent: snapshot\r\ndata: a\r\ndata: b\r\n\r\ndata: solto\n\n');
    expect(r.eventos).toEqual([
      { evento: 'snapshot', dados: 'a\nb' },
      { evento: 'message', dados: 'solto' },
    ]);
  });
});

describe('ClienteHabblaud.snapshot', () => {
  it('devolve o JSON do snapshot', async () => {
    const { url } = await subir((req, res) => {
      expect(req.url).toBe('/api/snapshot');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ rev: 7, rooms: [], agents: [] }));
    });
    const c = new ClienteHabblaud({ url: () => url + '/' });
    expect(await c.snapshot()).toEqual({ rev: 7, rooms: [], agents: [] });
  });

  it('estoura o timeout quando o servidor não responde', async () => {
    const { url } = await subir(() => {});
    const c = new ClienteHabblaud({ url: () => url, timeoutMs: 50 });
    await expect(c.snapshot()).rejects.toThrow();
  });

  it('erro HTTP rejeita', async () => {
    const { url } = await subir((_req, res) => {
      res.statusCode = 500;
      res.end('x');
    });
    await expect(new ClienteHabblaud({ url: () => url }).snapshot()).rejects.toThrow('HTTP 500');
  });
});

describe('ClienteHabblaud.assinar', () => {
  it('entrega 2 snapshots, ignora eventos desconhecidos e reconecta depois de o servidor fechar', async () => {
    let conexoes = 0;
    const { url } = await subir((_req, res) => {
      conexoes++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('retry: 2000\n\n');
      if (conexoes === 1) {
        res.write('event: snapshot\ndata: {"rev":1}\n\nevent: feed\ndata: []\n\n');
        setTimeout(() => res.end(), 20);
      } else {
        res.write(': ping\n\nevent: outro\ndata: x\n\nevent: snapshot\ndata: {"rev":2}\n\n');
      }
    });
    const atrasos: number[] = [];
    const c = new ClienteHabblaud({
      url: () => url,
      agendar: (fn, ms) => {
        atrasos.push(ms);
        const t = setTimeout(fn, 0);
        return () => clearTimeout(t);
      },
    });
    const snaps: unknown[] = [];
    const estados: boolean[] = [];
    const sub = c.assinar((s) => snaps.push(s), (o) => estados.push(o));
    await esperar(() => snaps.length === 2);
    sub.parar();
    expect(snaps).toEqual([{ rev: 1 }, { rev: 2 }]);
    expect(estados).toEqual([true, false, true]);
    expect(atrasos).toEqual([1000]);
    expect(conexoes).toBe(2);
  });

  it('espera cresce de 1 s a 15 s e parar() cancela o timer pendente', async () => {
    const { url, server } = await subir(() => {});
    await new Promise((ok) => server.close(ok)); // porta fechada: conexão recusada
    const atrasos: number[] = [];
    let cancelados = 0;
    let pendente: (() => void) | null = null;
    const c = new ClienteHabblaud({
      url: () => url,
      agendar: (fn, ms) => {
        atrasos.push(ms);
        pendente = fn;
        return () => void cancelados++;
      },
    });
    const estados: boolean[] = [];
    const sub = c.assinar(() => {}, (o) => estados.push(o));
    for (let i = 1; i <= 6; i++) {
      await esperar(() => atrasos.length === i);
      const f = pendente as (() => void) | null;
      pendente = null;
      if (i < 6) f?.();
    }
    expect(atrasos).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
    expect(estados).toEqual([false]);
    sub.parar();
    expect(cancelados).toBe(1);
  });

  it('parar() aborta a conexão aberta e não reconecta', async () => {
    let conexoes = 0;
    const { url } = await subir((_req, res) => {
      conexoes++;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: snapshot\ndata: {}\n\n');
    });
    let agendou = 0;
    const c = new ClienteHabblaud({ url: () => url, agendar: () => (agendou++, () => {}) });
    const snaps: unknown[] = [];
    const sub = c.assinar((s) => snaps.push(s), () => {});
    await esperar(() => snaps.length === 1);
    sub.parar();
    await new Promise((r) => setTimeout(r, 50));
    expect(agendou).toBe(0);
    expect(conexoes).toBe(1);
  });
});

describe('ClienteHabblaud.novoAgente', () => {
  it('POST JSON com folder e prompt, sem Origin', async () => {
    let visto: { method?: string; ct?: string; origin?: string; corpo?: string } = {};
    const { url } = await subir((req, res) => {
      let corpo = '';
      req.on('data', (d) => (corpo += d));
      req.on('end', () => {
        visto = { method: req.method, ct: req.headers['content-type'], origin: req.headers.origin, corpo };
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('{"id":"s1"}');
      });
    });
    const r = await new ClienteHabblaud({ url: () => url }).novoAgente('/home/x/app', 'faça isso');
    expect(r).toEqual({ ok: true });
    expect(visto.method).toBe('POST');
    expect(visto.ct).toMatch(/^application\/json/);
    expect(visto.origin).toBeUndefined();
    expect(JSON.parse(visto.corpo!)).toEqual({ folder: '/home/x/app', prompt: 'faça isso' });
  });

  it('erro HTTP devolve a mensagem do servidor', async () => {
    const { url } = await subir((req, res) => {
      req.resume();
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":"pasta inválida"}');
    });
    expect(await new ClienteHabblaud({ url: () => url }).novoAgente('/x', 'y')).toEqual({ ok: false, erro: 'pasta inválida' });
  });

  it('erro HTTP sem JSON usa o status; rede caída devolve erro', async () => {
    const { url, server } = await subir((req, res) => {
      req.resume();
      res.writeHead(502);
      res.end('bad');
    });
    const c = new ClienteHabblaud({ url: () => url });
    expect(await c.novoAgente('/x', 'y')).toEqual({ ok: false, erro: 'HTTP 502' });
    await new Promise((ok) => server.close(ok));
    const r = await c.novoAgente('/x', 'y');
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});
