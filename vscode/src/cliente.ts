// Cliente HTTP do Habblaud (sem 'vscode'): snapshot, stream SSE com reconexão e novo agente.
// Usa o fetch global (Node 20+). Protocolo do servidor: habblaud/server/http/sse.ts
// (`retry: 2000`, depois eventos `snapshot`, `feed` e `notice`; só o `snapshot` nos interessa).

export interface EventoSse {
  evento: string;
  dados: string;
}

/** Separa eventos SSE completos (terminados por linha em branco); o que sobra é um evento ainda incompleto. */
export function parseSse(buffer: string): { eventos: EventoSse[]; resto: string } {
  const partes = buffer.replace(/\r\n?/g, '\n').split('\n\n');
  const resto = partes.pop() ?? '';
  const eventos: EventoSse[] = [];
  for (const bloco of partes) {
    let evento = 'message';
    const dados: string[] = [];
    for (const linha of bloco.split('\n')) {
      if (!linha || linha.startsWith(':')) continue; // comentário (ping)
      const i = linha.indexOf(':');
      const campo = i < 0 ? linha : linha.slice(0, i);
      let valor = i < 0 ? '' : linha.slice(i + 1);
      if (valor.startsWith(' ')) valor = valor.slice(1);
      if (campo === 'event') evento = valor;
      else if (campo === 'data') dados.push(valor);
    }
    if (dados.length) eventos.push({ evento, dados: dados.join('\n') });
  }
  return { eventos, resto };
}

/** Agenda `fn` daqui a `ms` e devolve o cancelamento. */
export type Agendar = (fn: () => void, ms: number) => () => void;

const agendarReal: Agendar = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

const ESPERA_MIN = 1000;
const ESPERA_MAX = 15000;

export class ClienteHabblaud {
  private readonly url: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly agendar: Agendar;
  private readonly timeoutMs: number;

  constructor(opts: { url: () => string; fetchImpl?: typeof fetch; agendar?: Agendar; timeoutMs?: number }) {
    this.url = opts.url;
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.agendar = opts.agendar ?? agendarReal;
    this.timeoutMs = opts.timeoutMs ?? 5000;
  }

  private rota(caminho: string): string {
    return this.url().replace(/\/+$/, '') + caminho;
  }

  /** fetch com timeout; o timer sempre é limpo. */
  private async comTimeout(caminho: string, init: RequestInit = {}): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(this.rota(caminho), { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async snapshot(): Promise<unknown> {
    const res = await this.comTimeout('/api/snapshot');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  assinar(aoSnapshot: (s: unknown) => void, aoEstado: (online: boolean) => void): { parar(): void } {
    let parado = false;
    let espera = ESPERA_MIN;
    let online: boolean | null = null;
    let ctrl: AbortController | null = null;
    let cancelarTimer: (() => void) | null = null;

    const estado = (v: boolean) => {
      if (online === v) return;
      online = v;
      aoEstado(v);
    };

    const reconectar = () => {
      if (parado) return;
      estado(false);
      const ms = espera;
      espera = Math.min(espera * 2, ESPERA_MAX);
      cancelarTimer = this.agendar(() => {
        cancelarTimer = null;
        void conectar();
      }, ms);
    };

    const conectar = async () => {
      if (parado) return;
      ctrl = new AbortController();
      try {
        const res = await this.fetchImpl(this.rota('/api/stream'), { signal: ctrl.signal, headers: { Accept: 'text/event-stream' } });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          espera = ESPERA_MIN;
          estado(true);
          buf += dec.decode(value, { stream: true });
          const r = parseSse(buf);
          buf = r.resto;
          for (const e of r.eventos) {
            if (e.evento !== 'snapshot') continue; // feed, notice e desconhecidos: ignorados
            let s: unknown;
            try {
              s = JSON.parse(e.dados);
            } catch {
              continue;
            }
            if (!parado) aoSnapshot(s);
          }
        }
      } catch {
        // queda ou erro de rede: cai na reconexão
      }
      reconectar();
    };

    void conectar();

    return {
      parar() {
        if (parado) return;
        parado = true;
        ctrl?.abort();
        cancelarTimer?.();
        cancelarTimer = null;
      },
    };
  }

  async novoAgente(pasta: string, pedido: string): Promise<{ ok: boolean; erro?: string }> {
    try {
      const res = await this.comTimeout('/api/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: pasta, prompt: pedido }),
      });
      if (res.ok) return { ok: true };
      let erro = `HTTP ${res.status}`;
      try {
        const corpo = (await res.json()) as { error?: unknown };
        if (typeof corpo?.error === 'string' && corpo.error) erro = corpo.error;
      } catch {
        // corpo sem JSON: fica o status
      }
      return { ok: false, erro };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  }
}
