// Modelo dos cartões do painel presencial: agrupa as linhas por projeto, aplica o filtro e monta os textos de resumo.
// Funções puras (sem DOM).
import type { OfficeSnapshot } from '../../../../shared/types';
import { type LinhaPresencial, linhasPresencial } from './modelo';

export type FiltroPresencial = 'todos' | 'esperando' | 'trabalhando' | 'ociosos';

export interface AgenteCartao extends LinhaPresencial {
  /** agent.waitingFor quando status === 'waiting', senão null. */
  motivo: string | null;
  /** Urgente e com pedido de permissão para responder pelo escritório. */
  responder: boolean;
}

export interface CartaoProjeto {
  roomId: string;
  /** Nome da sala. */
  nome: string;
  /** Já na ordem de linhasPresencial, depois do filtro. */
  agentes: AgenteCartao[];
  /** Agentes do projeto (offline fora), sem filtro. */
  total: number;
  /** Status working | shell, sem filtro. */
  trabalhando: number;
  /** Status waiting, sem filtro. */
  esperando: number;
  /** Status idle | done, sem filtro. */
  ociosos: number;
  urgente: boolean;
}

export interface ResumoPresencial {
  total: number;
  esperando: number;
  trabalhando: number;
  ociosos: number;
}

/** Classe usada pelos filtros e pelos contadores. offline não entra em nenhuma. */
export function classeStatus(status: LinhaPresencial['status']): 'esperando' | 'trabalhando' | 'ociosos' | null {
  switch (status) {
    case 'waiting':
      return 'esperando';
    case 'working':
    case 'shell':
      return 'trabalhando';
    case 'idle':
    case 'done':
      return 'ociosos';
    default:
      return null;
  }
}

/** Contadores gerais do painel (mesmos agentes de linhasPresencial). */
export function resumoPresencial(snap: Pick<OfficeSnapshot, 'rooms' | 'agents'> | null, now: number): ResumoPresencial {
  const r: ResumoPresencial = { total: 0, esperando: 0, trabalhando: 0, ociosos: 0 };
  for (const l of linhasPresencial(snap, now)) {
    r.total++;
    const c = classeStatus(l.status);
    if (c === 'esperando') r.esperando++;
    else if (c === 'trabalhando') r.trabalhando++;
    else if (c === 'ociosos') r.ociosos++;
  }
  return r;
}

/** Um cartão por projeto, na ordem de linhasPresencial. Filtro mantém só os agentes da classe; cartão vazio some. */
export function cartoesPresencial(
  snap: Pick<OfficeSnapshot, 'rooms' | 'agents'> | null,
  now: number,
  filtro: FiltroPresencial,
): CartaoProjeto[] {
  if (!snap) return [];

  const agentes = new Map(snap.agents.map((a) => [a.id, a] as const));
  const cartoes = new Map<string, CartaoProjeto>();

  for (const l of linhasPresencial(snap, now)) {
    let c = cartoes.get(l.roomId);
    if (!c) {
      c = { roomId: l.roomId, nome: l.projeto ?? l.roomId, agentes: [], total: 0, trabalhando: 0, esperando: 0, ociosos: 0, urgente: false };
      cartoes.set(l.roomId, c);
    }

    const classe = classeStatus(l.status);
    c.total++;
    if (classe === 'esperando') c.esperando++;
    else if (classe === 'trabalhando') c.trabalhando++;
    else if (classe === 'ociosos') c.ociosos++;

    if (filtro !== 'todos' && classe !== filtro) continue;

    const agent = agentes.get(l.agentId);
    c.agentes.push({
      ...l,
      motivo: l.status === 'waiting' ? (agent?.waitingFor ?? null) : null,
      responder: l.urgente && agent?.permission != null,
    });
  }

  const saida: CartaoProjeto[] = [];
  for (const c of cartoes.values()) {
    c.urgente = c.esperando > 0;
    if (c.agentes.length > 0) saida.push(c);
  }
  return saida;
}

/** "1 agente" / "3 agentes". */
export function rotuloResumo(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

/** "3 agentes · 1 trabalhando · 1 precisa de você". Partes com zero somem (o total sempre aparece). */
export function resumoCartao(c: Pick<CartaoProjeto, 'total' | 'trabalhando' | 'esperando'>): string {
  const partes = [rotuloResumo(c.total, 'agente', 'agentes')];
  if (c.trabalhando > 0) partes.push(`${c.trabalhando} trabalhando`);
  if (c.esperando === 1) partes.push('1 precisa de você');
  else if (c.esperando > 1) partes.push(`${c.esperando} precisam de você`);
  return partes.join(' · ');
}
