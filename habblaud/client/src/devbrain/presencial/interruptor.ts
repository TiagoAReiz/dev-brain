// Interruptor do modo presencial: troca o prédio pela tabela, pausa o mundo e neutraliza o favicon.
import type { WorldApi } from '../../world/api';
import type { UiComponent, UiContext } from '../../ui/context';
import { h } from '../../ui/dom';
import { faviconPresencial } from './discricao';

/** href originais dos <link rel="icon">, guardados enquanto o modo está ligado. */
let originais: Map<HTMLLinkElement, string> | null = null;

export function aplicarModo(ligado: boolean, world: WorldApi): void {
  document.documentElement.classList.toggle('modo-presencial', ligado);
  world.setPaused?.(ligado);
  if (ligado) {
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    if (!originais) originais = new Map([...links].map((l) => [l, l.href]));
    const fav = faviconPresencial();
    for (const l of links) l.href = fav;
  } else if (originais) {
    for (const [l, href] of originais) l.href = href;
    originais = null;
  }
}

export class InterruptorPresencial implements UiComponent {
  readonly button: HTMLButtonElement;
  private aplicado: boolean | null = null;

  constructor(private ctx: UiContext) {
    this.button = h('button', {
      class: 'dbp-interruptor ui-btn',
      type: 'button',
      text: 'presencial',
      attrs: { 'aria-pressed': 'false' },
      on: { click: () => this.ctx.updatePrefs({ presencial: !this.ctx.prefs.presencial }) },
    }) as HTMLButtonElement;
  }

  render(): void {
    const ligado = this.ctx.prefs.presencial;
    if (ligado === this.aplicado) return;
    this.aplicado = ligado;
    this.button.setAttribute('aria-pressed', String(ligado));
    aplicarModo(ligado, this.ctx.world);
  }
}
