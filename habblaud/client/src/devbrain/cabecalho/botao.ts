// Botões do header (Iniciar dia, Finalizar dia, Presencial) num grupo segmentado, com ícone pixel e rótulo curto.
import { h, setAttr, setText, setTitle } from '../../ui/dom';
import { pixelIcon } from '../../ui/icons';
import './cabecalho.css';

export interface OpcoesBotao {
  rotulo: string;
  dica: string;
  icone: string;
  variante?: 'padrao' | 'acento';
}
export interface BotaoCabecalho {
  el: HTMLButtonElement;
  atualizar(p: { rotulo?: string; dica?: string; desabilitado?: boolean; ligado?: boolean }): void;
}

const CLS = 'ui-px-icon dbh-ico-svg';
const PALETA = { '#': 'currentColor' } as const;

/** Play (triângulo). */
export const ICONE_INICIAR = pixelIcon(
  ['..#.......', '..###.....', '..#####...', '..#######.', '..#######.', '..#####...', '..###.....', '..#.......'],
  PALETA,
  CLS,
);
/** Lua crescente. */
export const ICONE_FINALIZAR = pixelIcon(
  ['...####...', '..###.....', '.###......', '.###......', '.###......', '.####.....', '..#######.', '...#####..'],
  PALETA,
  CLS,
);
/** Monitor com um olho no meio. */
export const ICONE_PRESENCIAL = pixelIcon(
  ['##########', '#........#', '#..####..#', '#.#.##.#.#', '#..####..#', '#........#', '##########', '...####...', '..######..'],
  PALETA,
  CLS,
);

/** Dica do botão: o motivo de indisponível vai junto, nunca no rótulo visível. */
export function dicaIndisponivel(rotulo: string, motivo: string | null | undefined): string {
  return motivo ? `${rotulo}: ${motivo}` : rotulo;
}

export function botaoCabecalho(o: OpcoesBotao): BotaoCabecalho {
  const ico = h('span', { class: 'dbh-ico' });
  ico.innerHTML = o.icone;
  const rot = h('span', { class: 'dbh-rot', text: o.rotulo });
  const el = h(
    'button',
    { class: `dbh-btn${o.variante === 'acento' ? ' dbh-btn--acento' : ''}`, type: 'button', title: o.dica, attrs: { 'aria-label': o.dica } },
    ico,
    rot,
  );
  return {
    el,
    atualizar(p) {
      if (p.rotulo !== undefined) setText(rot, p.rotulo);
      if (p.dica !== undefined) {
        setTitle(el, p.dica);
        setAttr(el, 'aria-label', p.dica);
      }
      if (p.desabilitado !== undefined && el.disabled !== p.desabilitado) el.disabled = p.desabilitado;
      if (typeof p.ligado === 'boolean') {
        setAttr(el, 'aria-pressed', String(p.ligado));
        if (el.classList.contains('is-on') !== p.ligado) el.classList.toggle('is-on', p.ligado);
      }
    },
  };
}

export function grupoCabecalho(...botoes: HTMLElement[]): HTMLElement {
  return h('div', { class: 'dbh-grupo', role: 'group', attrs: { 'aria-label': 'Sessão' } }, ...botoes);
}
