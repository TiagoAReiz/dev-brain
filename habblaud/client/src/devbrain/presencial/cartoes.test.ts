import { describe, expect, it } from 'vitest';
import type { AgentInfo, AgentStatus, RoomInfo } from '../../../../shared/types';
import { cartoesPresencial, classeStatus, resumoCartao, resumoPresencial, rotuloResumo } from './cartoes';

const AGORA = 1_000_000;

function agente(id: string, roomId: string, status: AgentStatus, extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId,
    name: id.toUpperCase(),
    look: 'f',
    role: '',
    sessionId: id,
    account: 'conta',
    status,
    recent: [],
    tasks: [],
    startedAt: AGORA - 60_000,
    lastEventAt: AGORA,
    statusSince: AGORA - 5_000,
    stats: {} as AgentInfo['stats'],
    ...extra,
  } as AgentInfo;
}

function sala(id: string, name: string, slot: number): RoomInfo {
  return { id, name, path: `/x/${name}`, slot } as RoomInfo;
}

const PERMISSAO = { id: 'p1' } as AgentInfo['permission'];

describe('classeStatus', () => {
  it('agrupa os status nas três classes e ignora offline', () => {
    expect(classeStatus('waiting')).toBe('esperando');
    expect(classeStatus('working')).toBe('trabalhando');
    expect(classeStatus('shell')).toBe('trabalhando');
    expect(classeStatus('idle')).toBe('ociosos');
    expect(classeStatus('done')).toBe('ociosos');
    expect(classeStatus('offline')).toBeNull();
  });
});

describe('cartoesPresencial', () => {
  it('sem snapshot devolve lista vazia', () => {
    expect(cartoesPresencial(null, AGORA, 'todos')).toEqual([]);
  });

  it('deixa de fora agentes offline, inclusive nos contadores', () => {
    const snap = { rooms: [sala('r1', 'app', 0)], agents: [agente('a', 'r1', 'working'), agente('b', 'r1', 'offline')] };
    const [c] = cartoesPresencial(snap, AGORA, 'todos');
    expect(c.agentes.map((a) => a.agentId)).toEqual(['a']);
    expect(c.total).toBe(1);
  });

  it('um cartão por projeto, com nome da sala', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0), sala('r2', 'lib', 1)],
      agents: [agente('a', 'r1', 'working'), agente('b', 'r1', 'idle'), agente('c', 'r2', 'idle')],
    };
    const cartoes = cartoesPresencial(snap, AGORA, 'todos');
    expect(cartoes.map((c) => [c.roomId, c.nome, c.agentes.length])).toEqual([
      ['r1', 'app', 2],
      ['r2', 'lib', 1],
    ]);
  });

  it('filtro esperando mantém só agentes waiting e cartão sem agentes some', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0), sala('r2', 'lib', 1)],
      agents: [agente('a', 'r1', 'working'), agente('b', 'r2', 'waiting')],
    };
    const cartoes = cartoesPresencial(snap, AGORA, 'esperando');
    expect(cartoes.map((c) => c.roomId)).toEqual(['r2']);
    expect(cartoes[0].agentes.map((a) => a.agentId)).toEqual(['b']);
  });

  it('filtro trabalhando inclui working e shell, e ociosos inclui idle e done', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [
        agente('a', 'r1', 'working'),
        agente('b', 'r1', 'shell'),
        agente('c', 'r1', 'idle'),
        agente('d', 'r1', 'done'),
        agente('e', 'r1', 'waiting'),
      ],
    };
    const trab = cartoesPresencial(snap, AGORA, 'trabalhando');
    // A ordem interna segue sortByUrgency (não é o foco deste teste), então compara como conjunto.
    expect(trab[0].agentes.map((a) => a.agentId).sort()).toEqual(['a', 'b']);
    const oci = cartoesPresencial(snap, AGORA, 'ociosos');
    expect(oci[0].agentes.map((a) => a.agentId).sort()).toEqual(['c', 'd']);
  });

  it('contadores do cartão ignoram o filtro', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [agente('a', 'r1', 'working'), agente('b', 'r1', 'waiting'), agente('c', 'r1', 'idle')],
    };
    const [c] = cartoesPresencial(snap, AGORA, 'trabalhando');
    expect(c.agentes).toHaveLength(1);
    expect(c).toMatchObject({ total: 3, trabalhando: 1, esperando: 1, ociosos: 1, urgente: true });
  });

  it('urgente só quando há agente esperando; cartão urgente vem primeiro', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0), sala('r2', 'lib', 1)],
      agents: [agente('a', 'r1', 'working'), agente('b', 'r2', 'waiting')],
    };
    const cartoes = cartoesPresencial(snap, AGORA, 'todos');
    expect(cartoes.map((c) => [c.roomId, c.urgente])).toEqual([
      ['r2', true],
      ['r1', false],
    ]);
  });

  it('motivo vem de waitingFor só em waiting', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [
        agente('a', 'r1', 'waiting', { waitingFor: 'aprovar uma permissão' }),
        agente('b', 'r1', 'working', { waitingFor: 'ignorado' }),
      ],
    };
    const [c] = cartoesPresencial(snap, AGORA, 'todos');
    const motivos = Object.fromEntries(c.agentes.map((a) => [a.agentId, a.motivo]));
    expect(motivos).toEqual({ a: 'aprovar uma permissão', b: null });
  });

  it('responder só com agente urgente e permission presente', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [
        agente('a', 'r1', 'waiting', { permission: PERMISSAO }),
        agente('b', 'r1', 'waiting'),
        agente('c', 'r1', 'working', { permission: PERMISSAO }),
      ],
    };
    const [c] = cartoesPresencial(snap, AGORA, 'todos');
    const responder = Object.fromEntries(c.agentes.map((a) => [a.agentId, a.responder]));
    expect(responder).toEqual({ a: true, b: false, c: false });
  });

  it('subagente mantém a ordem de linhasPresencial (logo abaixo do pai)', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [
        agente('p1', 'r1', 'idle'),
        agente('p2', 'r1', 'working'),
        agente('s1', 'r1', 'working', { kind: 'sub', parentId: 'p1' }),
      ],
    };
    const [c] = cartoesPresencial(snap, AGORA, 'todos');
    expect(c.agentes.map((a) => [a.agentId, a.sub])).toEqual([
      ['p2', false],
      ['p1', false],
      ['s1', true],
    ]);
  });
});

describe('resumoPresencial', () => {
  it('conta agentes presentes por classe', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [
        agente('a', 'r1', 'working'),
        agente('b', 'r1', 'shell'),
        agente('c', 'r1', 'waiting'),
        agente('d', 'r1', 'done'),
        agente('e', 'r1', 'offline'),
      ],
    };
    expect(resumoPresencial(snap, AGORA)).toEqual({ total: 4, esperando: 1, trabalhando: 2, ociosos: 1 });
    expect(resumoPresencial(null, AGORA)).toEqual({ total: 0, esperando: 0, trabalhando: 0, ociosos: 0 });
  });
});

describe('rotuloResumo', () => {
  it('singular com 1 e plural nos demais', () => {
    expect(rotuloResumo(1, 'agente', 'agentes')).toBe('1 agente');
    expect(rotuloResumo(3, 'agente', 'agentes')).toBe('3 agentes');
    expect(rotuloResumo(0, 'agente', 'agentes')).toBe('0 agentes');
  });
});

describe('resumoCartao', () => {
  it('monta o resumo com as partes não zeradas', () => {
    expect(resumoCartao({ total: 3, trabalhando: 1, esperando: 1 })).toBe('3 agentes · 1 trabalhando · 1 precisa de você');
  });

  it('omite partes zeradas, mantendo o total', () => {
    expect(resumoCartao({ total: 2, trabalhando: 0, esperando: 0 })).toBe('2 agentes');
    expect(resumoCartao({ total: 1, trabalhando: 1, esperando: 0 })).toBe('1 agente · 1 trabalhando');
  });

  it('plural de precisa de você quando há mais de um', () => {
    expect(resumoCartao({ total: 2, trabalhando: 0, esperando: 2 })).toBe('2 agentes · 2 precisam de você');
  });
});
