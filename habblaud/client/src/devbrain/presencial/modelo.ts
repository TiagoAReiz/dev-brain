// Modelo da tabela do modo presencial: linhas já ordenadas e prontas para exibir. Funções puras (sem DOM).
import type { AgentStatus, OfficeSnapshot } from '../../../../shared/types';
import { relativeTime } from '../../ui/format';
import { activityFallback, displayStatus, sortByUrgency, statusLabel } from '../../ui/model';

export interface LinhaPresencial {
  agentId: string;
  roomId: string;
  /** Nome da sala só na 1ª linha de cada grupo; null nas demais. */
  projeto: string | null;
  nome: string;
  /** true = subagente (aparece logo abaixo do agente pai). */
  sub: boolean;
  status: AgentStatus;
  statusTexto: string;
  atividade: string;
  desde: string;
  urgente: boolean;
}

interface Grupo {
  roomId: string;
  /** Posição da sala em `snap.rooms` (salas ausentes ficam no fim). */
  ordem: number;
  nome: string;
  agents: OfficeSnapshot['agents'];
}

/** Linhas da tabela: sem snapshot, vazio; agentes saindo ficam de fora; grupos por sala com 'waiting' primeiro. */
export function linhasPresencial(snap: Pick<OfficeSnapshot, 'rooms' | 'agents'> | null, now: number): LinhaPresencial[] {
  if (!snap) return [];

  const presentes = snap.agents.filter((a) => a.status !== 'offline');
  const grupos = new Map<string, Grupo>();
  for (const a of presentes) {
    let g = grupos.get(a.roomId);
    if (!g) {
      const i = snap.rooms.findIndex((r) => r.id === a.roomId);
      const sala = i >= 0 ? snap.rooms[i] : undefined;
      grupos.set(a.roomId, (g = {
        roomId: a.roomId,
        ordem: i >= 0 ? i : snap.rooms.length,
        nome: sala?.name ?? a.roomId,
        agents: [],
      }));
    }
    g.agents.push(a);
  }

  const ordenados = [...grupos.values()].sort((x, y) => {
    const xw = x.agents.some((a) => a.status === 'waiting') ? 0 : 1;
    const yw = y.agents.some((a) => a.status === 'waiting') ? 0 : 1;
    return xw - yw || x.ordem - y.ordem;
  });

  const out: LinhaPresencial[] = [];
  for (const g of ordenados) {
    const ids = new Set(g.agents.map((a) => a.id));
    const filhos = new Map<string, typeof g.agents>();
    const topo: typeof g.agents = [];
    for (const a of g.agents) {
      if (a.parentId && ids.has(a.parentId)) {
        let lista = filhos.get(a.parentId);
        if (!lista) filhos.set(a.parentId, (lista = []));
        lista.push(a);
      } else {
        topo.push(a);
      }
    }

    const emitidos = new Set<string>();
    const sequencia: typeof g.agents = [];
    const adiciona = (a: (typeof g.agents)[number]) => {
      if (emitidos.has(a.id)) return;
      emitidos.add(a.id);
      sequencia.push(a);
      for (const s of sortByUrgency(filhos.get(a.id) ?? [])) adiciona(s);
    };
    for (const a of sortByUrgency(topo)) adiciona(a);
    // Ciclo de parentesco (A é pai de B e B de A): ninguém fica de fora.
    for (const a of sortByUrgency(g.agents)) adiciona(a);

    sequencia.forEach((a, i) => {
      const status = displayStatus(a, now);
      out.push({
        agentId: a.id,
        roomId: g.roomId,
        projeto: i === 0 ? g.nome : null,
        nome: a.name,
        sub: a.kind === 'sub',
        status,
        statusTexto: statusLabel(status),
        atividade: a.activity?.text ?? activityFallback(a),
        desde: relativeTime(a.statusSince, now),
        urgente: status === 'waiting',
      });
    });
  }
  return out;
}
