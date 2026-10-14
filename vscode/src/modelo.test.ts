import { describe, expect, it } from 'vitest';
import { arquivosDoAgente, arvore, resumo } from './modelo';

// Fixture com a forma real do OfficeSnapshot (habblaud/shared/types.ts), valores fictícios.
function atividade(over: Record<string, unknown>) {
  return { id: 'a', kind: 'other', icon: '•', text: 'x', at: 1000, ...over };
}

function agente(over: Record<string, unknown>) {
  return {
    id: '.claude:1',
    kind: 'main',
    roomId: '/home/exemplo/app',
    name: 'Ana',
    look: 'f',
    role: 'Agente principal',
    sessionId: 's1',
    account: '.claude',
    status: 'idle',
    recent: [],
    tasks: [],
    startedAt: 1000,
    lastEventAt: 1000,
    statusSince: 1000,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: 1,
    ...over,
  };
}

function sala(over: Record<string, unknown>) {
  return { id: '/home/exemplo/app', name: 'app', path: '/home/exemplo/app', slot: 0, seed: 1, createdAt: 1000, ...over };
}

function snapshot(over: Record<string, unknown> = {}) {
  return { rev: 1, serverTime: 1000, rooms: [], agents: [], accounts: [], meta: { demo: false, sources: [], startedAt: 0, version: '0' }, ...over };
}

describe('arquivosDoAgente', () => {
  it('ignora Bash, Grep e detail relativo; aceita Read/Edit/Write/MultiEdit/NotebookEdit', () => {
    const a = agente({
      recent: [
        atividade({ kind: 'run', tool: 'Bash', detail: 'cat /home/exemplo/app/x.ts', at: 1 }),
        atividade({ kind: 'search', tool: 'Grep', detail: '/home/exemplo/app', at: 2 }),
        atividade({ kind: 'read', tool: 'Read', detail: 'src/relativo.ts', at: 3 }),
        atividade({ kind: 'read', tool: 'Read', detail: '/home/exemplo/app/ok.ts', at: 4 }),
        atividade({ kind: 'edit', tool: 'MultiEdit', detail: '/home/exemplo/app/m.ts', at: 5 }),
        atividade({ kind: 'edit', tool: 'NotebookEdit', detail: '/home/exemplo/app/n.ipynb', at: 6 }),
        atividade({ kind: 'write', tool: 'Write', detail: '/home/exemplo/app/w.md', at: 7 }),
      ],
    });
    expect(arquivosDoAgente(a).map((x) => x.caminho)).toEqual([
      '/home/exemplo/app/w.md',
      '/home/exemplo/app/n.ipynb',
      '/home/exemplo/app/m.ts',
      '/home/exemplo/app/ok.ts',
    ]);
    expect(arquivosDoAgente(a).find((x) => x.caminho.endsWith('w.md'))?.tipo).toBe('edit');
  });

  it('um caminho aparece uma vez: edit vence read e fica com o horário mais recente', () => {
    const a = agente({
      recent: [
        atividade({ kind: 'edit', tool: 'Edit', detail: '/home/exemplo/app/a.ts', at: 10 }),
        atividade({ kind: 'read', tool: 'Read', detail: '/home/exemplo/app/b.ts', at: 20 }),
        atividade({ kind: 'read', tool: 'Read', detail: '/home/exemplo/app/a.ts', at: 30 }),
      ],
    });
    expect(arquivosDoAgente(a)).toEqual([
      { caminho: '/home/exemplo/app/a.ts', tipo: 'edit', em: 30 },
      { caminho: '/home/exemplo/app/b.ts', tipo: 'read', em: 20 },
    ]);
  });

  it('read só continua read quando nunca houve edit', () => {
    const a = agente({
      recent: [atividade({ kind: 'read', tool: 'Read', detail: '/home/exemplo/app/a.ts', at: 10 })],
    });
    expect(arquivosDoAgente(a)).toEqual([{ caminho: '/home/exemplo/app/a.ts', tipo: 'read', em: 10 }]);
  });

  it('tolera JSON inesperado sem lançar', () => {
    expect(arquivosDoAgente(null)).toEqual([]);
    expect(arquivosDoAgente('x')).toEqual([]);
    expect(arquivosDoAgente({})).toEqual([]);
    expect(arquivosDoAgente({ recent: 'nope' })).toEqual([]);
    expect(arquivosDoAgente({ recent: [null, 1, { kind: 'read', tool: 'Read' }] })).toEqual([]);
  });
});

describe('arvore', () => {
  it('salas na ordem de slot, não na ordem do array', () => {
    const s = snapshot({
      rooms: [sala({ id: 'B', path: '/b', slot: 2 }), sala({ id: 'A', path: '/a', slot: 0 }), sala({ id: 'C', path: '/c', slot: 1 })],
      agents: [agente({ id: 'a', roomId: 'A' }), agente({ id: 'b', roomId: 'B' }), agente({ id: 'c', roomId: 'C' })],
    });
    expect(arvore(s).map((n) => n.id)).toEqual(['A', 'C', 'B']);
    expect(arvore(s)[0]).toMatchObject({ nome: 'app', caminho: '/a' });
  });

  it('principais antes dos subagentes, com sub = parentId definido', () => {
    const s = snapshot({
      rooms: [sala({})],
      agents: [
        agente({ id: '.claude:2', kind: 'sub', parentId: '.claude:1', role: 'Explore', title: 'buscar' }),
        agente({ id: '.claude:1', role: 'Agente principal', title: 'sessão', status: 'working' }),
      ],
    });
    const [no] = arvore(s);
    expect(no?.agentes.map((a) => [a.id, a.sub])).toEqual([
      ['.claude:1', false],
      ['.claude:2', true],
    ]);
    expect(no?.agentes[0]).toMatchObject({ papel: 'Agente principal', titulo: 'sessão', estado: 'working' });
    expect(no?.agentes[1]).toMatchObject({ papel: 'Explore', titulo: 'buscar' });
  });

  it('sala sem agente é omitida; agente de sala desconhecida some', () => {
    const s = snapshot({
      rooms: [sala({ id: 'vazia', path: '/vazia', slot: 0 }), sala({ id: 'cheia', path: '/cheia', slot: 1 })],
      agents: [agente({ id: 'x', roomId: 'cheia' }), agente({ id: 'y', roomId: 'nao-existe' })],
    });
    expect(arvore(s).map((n) => n.id)).toEqual(['cheia']);
    expect(arvore(s)[0]?.agentes.map((a) => a.id)).toEqual(['x']);
  });

  it('inclui arquivos do agente e o motivo de espera', () => {
    const s = snapshot({
      rooms: [sala({})],
      agents: [
        agente({
          status: 'waiting',
          waitingFor: 'aprovar uma permissão',
          recent: [atividade({ kind: 'edit', tool: 'Edit', detail: '/home/exemplo/app/a.ts', at: 5 })],
        }),
      ],
    });
    expect(arvore(s)[0]?.agentes[0]).toMatchObject({
      esperandoPor: 'aprovar uma permissão',
      arquivos: [{ caminho: '/home/exemplo/app/a.ts', tipo: 'edit', em: 5 }],
    });
  });

  it('tolera JSON inesperado sem lançar', () => {
    expect(arvore(undefined)).toEqual([]);
    expect(arvore(snapshot({ rooms: 'x', agents: 3 }))).toEqual([]);
    expect(arvore(snapshot({ rooms: [null, { id: 1 }], agents: [null, { roomId: 'x' }] }))).toEqual([]);
  });
});

describe('resumo', () => {
  it('conta trabalhando (working) e esperando (waiting)', () => {
    const s = snapshot({
      agents: [
        agente({ id: '1', status: 'working' }),
        agente({ id: '2', status: 'working' }),
        agente({ id: '3', status: 'waiting' }),
        agente({ id: '4', status: 'idle' }),
        agente({ id: '5', status: 'shell' }),
        agente({ id: '6', status: 'done' }),
      ],
    });
    expect(resumo(s)).toEqual({ trabalhando: 2, esperando: 1, total: 6 });
  });

  it('tolera campos ausentes e JSON inesperado', () => {
    expect(resumo(undefined)).toEqual({ trabalhando: 0, esperando: 0, total: 0 });
    expect(resumo({ agents: 'x' })).toEqual({ trabalhando: 0, esperando: 0, total: 0 });
    // Sem id não conta (nem em total); sem status conta só no total.
    expect(resumo(snapshot({ agents: [null, { status: 'working' }, { id: 'a' }, { id: 'b', status: 'working' }] }))).toEqual({
      trabalhando: 1,
      esperando: 0,
      total: 2,
    });
  });
});
