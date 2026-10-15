import { describe, expect, it } from 'vitest';
import type { AgentInfo, AgentStatus, RoomInfo } from '../../../../shared/types';
import { linhasPresencial } from './modelo';

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

describe('linhasPresencial', () => {
  it('sem snapshot devolve lista vazia', () => {
    expect(linhasPresencial(null, AGORA)).toEqual([]);
  });

  it('deixa de fora agentes offline', () => {
    const snap = { rooms: [sala('r1', 'app', 0)], agents: [agente('a', 'r1', 'working'), agente('b', 'r1', 'offline')] };
    const linhas = linhasPresencial(snap, AGORA);
    expect(linhas.map((l) => l.agentId)).toEqual(['a']);
  });

  it('monta os campos da linha', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [agente('a', 'r1', 'working', { activity: { text: 'Lendo arquivo' } as AgentInfo['activity'] })],
    };
    const [l] = linhasPresencial(snap, AGORA);
    expect(l).toMatchObject({
      agentId: 'a',
      roomId: 'r1',
      projeto: 'app',
      nome: 'A',
      sub: false,
      status: 'working',
      statusTexto: 'Trabalhando',
      atividade: 'Lendo arquivo',
      urgente: false,
    });
    expect(l.desde).toBe('há 5 s');
  });

  it('grupo com agente waiting vem primeiro, mesmo que a sala esteja depois em rooms', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0), sala('r2', 'lib', 1)],
      agents: [agente('a', 'r1', 'working'), agente('b', 'r2', 'waiting')],
    };
    const linhas = linhasPresencial(snap, AGORA);
    expect(linhas.map((l) => l.agentId)).toEqual(['b', 'a']);
    expect(linhas[0].urgente).toBe(true);
  });

  it('sem waiting, grupos seguem a ordem de rooms', () => {
    const snap = {
      rooms: [sala('r2', 'lib', 0), sala('r1', 'app', 1)],
      agents: [agente('a', 'r1', 'idle'), agente('b', 'r2', 'idle')],
    };
    expect(linhasPresencial(snap, AGORA).map((l) => l.agentId)).toEqual(['b', 'a']);
  });

  it('subagente aparece logo abaixo do pai', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [
        agente('p1', 'r1', 'idle'),
        agente('p2', 'r1', 'working'),
        agente('s1', 'r1', 'working', { kind: 'sub', parentId: 'p1' }),
      ],
    };
    const linhas = linhasPresencial(snap, AGORA);
    expect(linhas.map((l) => l.agentId)).toEqual(['p2', 'p1', 's1']);
    expect(linhas[2]).toMatchObject({ sub: true, projeto: null });
  });

  it('subagente órfão (pai ausente do grupo) vira linha de primeiro nível', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [
        agente('p1', 'r1', 'offline'),
        agente('s1', 'r1', 'idle', { kind: 'sub', parentId: 'p1' }),
        agente('a', 'r1', 'working'),
      ],
    };
    const linhas = linhasPresencial(snap, AGORA);
    expect(linhas.map((l) => l.agentId)).toEqual(['a', 's1']);
    expect(linhas[1]).toMatchObject({ sub: true, projeto: null });
  });

  it('projeto aparece só na 1ª linha de cada grupo', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0), sala('r2', 'lib', 1)],
      agents: [
        agente('a', 'r1', 'working'),
        agente('b', 'r1', 'idle'),
        agente('c', 'r2', 'idle'),
      ],
    };
    const linhas = linhasPresencial(snap, AGORA);
    expect(linhas.map((l) => [l.agentId, l.projeto])).toEqual([
      ['a', 'app'],
      ['b', null],
      ['c', 'lib'],
    ]);
  });

  it('sala ausente de rooms vai para o fim, com projeto = roomId', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [agente('x', 'r9', 'working'), agente('a', 'r1', 'idle')],
    };
    const linhas = linhasPresencial(snap, AGORA);
    expect(linhas.map((l) => l.agentId)).toEqual(['a', 'x']);
    expect(linhas[1].projeto).toBe('r9');
  });

  it('traz o nome curto do modelo e deixa vazio quando não há', () => {
    const snap = {
      rooms: [sala('r1', 'app', 0)],
      agents: [agente('a', 'r1', 'working', { model: 'claude-opus-5-5' }), agente('b', 'r1', 'idle')],
    };
    const [a, b] = linhasPresencial(snap, AGORA);
    expect(a).toMatchObject({ modelo: 'Opus 5.5', modeloCompleto: 'claude-opus-5-5' });
    expect(b).toMatchObject({ modelo: '', modeloCompleto: '' });
  });
});
