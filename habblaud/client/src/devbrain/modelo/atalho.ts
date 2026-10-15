// Atalho para trocar modelo e effort de um agente: manda `/model` ou `/effort` ao terminal interativo dele e abre
// esse terminal, onde o Claude Code mostra o seletor. Só vale para agentes abertos no terminal do Habblaud.
import type { PtyInfo } from '../../../../shared/types';
import type { UiContext } from '../../ui/context';
import { h } from '../../ui/dom';
import { postPty } from '../../ui/ptyapi';

export type Seletor = 'model' | 'effort';

export const EVENTO_MODELO = 'devbrain:modelo';

export interface PedidoModelo {
  agentId: string;
  ancora: HTMLElement;
}

export interface OpcaoMenu {
  rotulo: string;
  /** Argumento do comando; vazio abre o seletor do próprio Claude Code. */
  valor: string;
}

export const MODELOS: readonly OpcaoMenu[] = [
  { rotulo: 'Opus 5.5', valor: 'claude-opus-5-5' },
  { rotulo: 'Sonnet 5.5', valor: 'claude-sonnet-5-5' },
  { rotulo: 'Haiku 5.5', valor: 'claude-haiku-5-5' },
  { rotulo: 'Fable 5.1', valor: 'claude-fable-5-1' },
];

export const EFFORTS: readonly OpcaoMenu[] = ['low', 'medium', 'high', 'xhigh', 'max'].map((n) => ({ rotulo: n, valor: n }));

/** Texto digitado no terminal (Enter no fim). Sem valor, o Claude Code mostra o seletor dele. */
export function comandoSeletor(qual: Seletor, valor = ''): string {
  return `/${qual}${valor ? ` ${valor}` : ''}\r`;
}

/** O modelo do agente (ID completo) é esta opção? */
export function modeloAtual(opcao: OpcaoMenu, modelo: string | undefined): boolean {
  return !!modelo && modelo.startsWith(opcao.valor);
}

/** Terminal interativo vivo do agente, se houver. */
export function ptyVivo(ptys: readonly PtyInfo[] | undefined, agentId: string): PtyInfo | undefined {
  return ptys?.find((p) => p.agentId === agentId && p.exitedAt === undefined);
}

/** Chip clicável: pede o menu do agente (quem abre é instalarAtalhoModelo, ouvindo o evento). */
export function chipModelo(agentId: () => string | null, classe: string): HTMLButtonElement {
  const b = h('button', { class: `${classe} dbm-chip`, type: 'button' });
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = agentId();
    if (id) b.dispatchEvent(new CustomEvent<PedidoModelo>(EVENTO_MODELO, { bubbles: true, detail: { agentId: id, ancora: b } }));
  });
  return b;
}

export function instalarAtalhoModelo(ctx: UiContext): void {
  let menu: HTMLElement | null = null;
  const fechar = () => {
    menu?.remove();
    menu = null;
  };
  document.addEventListener('click', fechar);
  document.addEventListener('keydown', (ev) => ev.key === 'Escape' && fechar());

  document.addEventListener(EVENTO_MODELO, (ev) => {
    const { agentId, ancora } = (ev as CustomEvent<PedidoModelo>).detail;
    fechar();
    const pty = ptyVivo(ctx.store.snapshot?.ptys, agentId);
    const aviso = h('div', { class: 'dbm-aviso', hidden: true });
    const atual = ctx.store.snapshot?.agents.find((a) => a.id === agentId)?.model;
    const enviar = async (qual: Seletor, valor = '') => {
      if (!pty) {
        aviso.textContent = 'Só dá para trocar em agentes abertos no terminal do Habblaud.';
        aviso.hidden = false;
        return;
      }
      fechar();
      ctx.terminals?.open(agentId);
      await postPty(`/api/pty/${encodeURIComponent(pty.id)}/input`, { data: comandoSeletor(qual, valor) }).catch(() => undefined);
    };
    const item = (texto: string, qual: Seletor, valor = '', marcado = false) =>
      h('button', {
        class: `dbm-item${marcado ? ' dbm-item--atual' : ''}`,
        type: 'button',
        text: marcado ? `✓ ${texto}` : texto,
        on: { click: (e) => (e.stopPropagation(), void enviar(qual, valor)) },
      });
    const titulo = (t: string) => h('div', { class: 'dbm-titulo', text: t });
    menu = h(
      'div',
      { class: 'dbm-menu', role: 'menu' },
      titulo('Modelo'),
      ...MODELOS.map((o) => item(o.rotulo, 'model', o.valor, modeloAtual(o, atual))),
      item('Outros… (abre o seletor)', 'model'),
      titulo('Effort'),
      ...EFFORTS.map((o) => item(o.rotulo, 'effort', o.valor)),
      item('Outros… (abre o seletor)', 'effort'),
      aviso,
    );
    document.body.append(menu);
    const r = ancora.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 220))}px`;
    menu.style.top = `${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 380))}px`;
  });
}
