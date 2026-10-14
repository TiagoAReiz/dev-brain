// Modelo puro do snapshot do Habblaud: árvore salas → agentes → arquivos, e resumo.
// Sem `import 'vscode'`: tudo aqui é testável no node. Tolerante a JSON inesperado (nunca lança).

/** AgentStatus do Habblaud, como vem (working, waiting, idle, shell, done, offline). */
export type EstadoAgente = string;

export interface ArquivoMexido {
  caminho: string;
  tipo: 'read' | 'edit';
  /** Epoch ms da atividade mais recente sobre o arquivo. */
  em: number;
}

export interface NoAgente {
  id: string;
  nome: string;
  papel: string;
  titulo?: string;
  estado: EstadoAgente;
  esperandoPor?: string;
  sub: boolean;
  arquivos: ArquivoMexido[];
}

export interface NoSala {
  id: string;
  nome: string;
  caminho: string;
  agentes: NoAgente[];
}

export interface ResumoAgentes {
  trabalhando: number;
  esperando: number;
  total: number;
}

type Registro = Record<string, unknown>;

/** Ferramentas cujo `detail` é o caminho de um arquivo mexido. */
const FERRAMENTAS_DE_ARQUIVO = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Estados que contam como trabalho ativo (o agente está processando um turno). */
const ESTADOS_TRABALHANDO = new Set(['working']);

function ehRegistro(valor: unknown): valor is Registro {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function ehCaminhoAbsoluto(caminho: string): boolean {
  return caminho.startsWith('/') || /^[A-Za-z]:[\\/]/.test(caminho);
}

/**
 * Arquivos lidos/editados por um agente, a partir de `recent`. Só Read/Edit/Write/MultiEdit/NotebookEdit com
 * `detail` absoluto. Um caminho aparece uma vez: `edit` vence `read`, `em` é o da atividade mais recente.
 * Lista do mais recente para o mais antigo.
 */
export function arquivosDoAgente(agente: unknown): ArquivoMexido[] {
  if (!ehRegistro(agente) || !Array.isArray(agente.recent)) return [];

  const porCaminho = new Map<string, ArquivoMexido>();
  for (const atividade of agente.recent) {
    if (!ehRegistro(atividade)) continue;
    const { kind, tool, detail, at } = atividade;
    // Write chega como kind 'write' (shared/activity.ts); conta como edição.
    if (kind !== 'read' && kind !== 'edit' && kind !== 'write') continue;
    if (typeof tool !== 'string' || !FERRAMENTAS_DE_ARQUIVO.has(tool)) continue;
    if (typeof detail !== 'string' || !ehCaminhoAbsoluto(detail)) continue;

    const tipo: ArquivoMexido['tipo'] = kind === 'read' ? 'read' : 'edit';
    const em = typeof at === 'number' && Number.isFinite(at) ? at : 0;
    const atual = porCaminho.get(detail);
    if (!atual) {
      porCaminho.set(detail, { caminho: detail, tipo, em });
    } else {
      atual.tipo = atual.tipo === 'edit' || tipo === 'edit' ? 'edit' : 'read';
      atual.em = Math.max(atual.em, em);
    }
  }

  return [...porCaminho.values()].sort((a, b) => b.em - a.em);
}

/**
 * Salas na ordem de `slot`, com os agentes de cada uma (principais antes dos subagentes). Sala sem agente é omitida.
 */
export function arvore(snapshot: unknown): NoSala[] {
  if (!ehRegistro(snapshot)) return [];
  const salas = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
  const agentes = Array.isArray(snapshot.agents) ? snapshot.agents : [];

  const porSala = new Map<string, NoAgente[]>();
  for (const agente of agentes) {
    if (!ehRegistro(agente) || typeof agente.id !== 'string' || typeof agente.roomId !== 'string') continue;
    const sub = agente.parentId !== undefined;
    const no: NoAgente = {
      id: agente.id,
      nome: typeof agente.name === 'string' ? agente.name : agente.id,
      papel: typeof agente.role === 'string' ? agente.role : '',
      estado: typeof agente.status === 'string' ? agente.status : '',
      sub,
      arquivos: arquivosDoAgente(agente),
    };
    if (typeof agente.title === 'string') no.titulo = agente.title;
    if (typeof agente.waitingFor === 'string') no.esperandoPor = agente.waitingFor;
    const lista = porSala.get(agente.roomId) ?? [];
    lista.push(no);
    porSala.set(agente.roomId, lista);
  }

  const nos: { slot: number; no: NoSala }[] = [];
  for (const sala of salas) {
    if (!ehRegistro(sala) || typeof sala.id !== 'string') continue;
    const daSala = porSala.get(sala.id);
    if (!daSala || daSala.length === 0) continue;
    // Principais antes dos subagentes; dentro de cada grupo, a ordem do snapshot.
    const ordenados = [...daSala.filter((a) => !a.sub), ...daSala.filter((a) => a.sub)];
    const caminho = typeof sala.path === 'string' ? sala.path : sala.id;
    nos.push({
      slot: typeof sala.slot === 'number' && Number.isFinite(sala.slot) ? sala.slot : Number.POSITIVE_INFINITY,
      no: {
        id: sala.id,
        nome: typeof sala.name === 'string' ? sala.name : sala.id,
        caminho,
        agentes: ordenados,
      },
    });
  }

  return nos.sort((a, b) => a.slot - b.slot).map((x) => x.no);
}

/** Contagem de agentes: `esperando` = status 'waiting'; `trabalhando` = status 'working'; `total` = agentes válidos. */
export function resumo(snapshot: unknown): ResumoAgentes {
  const vazio: ResumoAgentes = { trabalhando: 0, esperando: 0, total: 0 };
  if (!ehRegistro(snapshot) || !Array.isArray(snapshot.agents)) return vazio;

  for (const agente of snapshot.agents) {
    if (!ehRegistro(agente) || typeof agente.id !== 'string') continue;
    vazio.total++;
    const estado = typeof agente.status === 'string' ? agente.status : '';
    if (ESTADOS_TRABALHANDO.has(estado)) vazio.trabalhando++;
    if (estado === 'waiting') vazio.esperando++;
  }
  return vazio;
}
