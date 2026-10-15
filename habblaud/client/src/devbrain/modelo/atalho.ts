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

/** Texto digitado no terminal (Enter no fim). */
export function comandoSeletor(qual: Seletor): string {
  return `/${qual}\r`;
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
    const enviar = async (qual: Seletor) => {
      if (!pty) {
        aviso.textContent = 'Só dá para trocar em agentes abertos no terminal do Habblaud.';
        aviso.hidden = false;
        return;
      }
      fechar();
      ctx.terminals?.open(agentId);
      await postPty(`/api/pty/${encodeURIComponent(pty.id)}/input`, { data: comandoSeletor(qual) }).catch(() => undefined);
    };
    const item = (texto: string, qual: Seletor) =>
      h('button', { class: 'dbm-item', type: 'button', text: texto, on: { click: (e) => (e.stopPropagation(), void enviar(qual)) } });
    menu = h('div', { class: 'dbm-menu', role: 'menu' }, item('Trocar modelo  (/model)', 'model'), item('Mudar effort  (/effort)', 'effort'), aviso);
    document.body.append(menu);
    const r = ancora.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 220))}px`;
    menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 100)}px`;
  });
}
