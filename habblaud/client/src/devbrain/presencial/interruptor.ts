// Interruptor do modo presencial: troca o prédio pela tabela, pausa o mundo e neutraliza o favicon.
import type { WorldApi } from '../../world/api';
import type { UiComponent, UiContext } from '../../ui/context';
import { botaoCabecalho, ICONE_PRESENCIAL, type BotaoCabecalho } from '../cabecalho/botao';
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
  private readonly botao: BotaoCabecalho;
  private aplicado: boolean | null = null;

  constructor(private ctx: UiContext) {
    this.botao = botaoCabecalho({
      rotulo: 'Presencial',
      dica: 'Modo presencial: troca o prédio por um painel sóbrio',
      icone: ICONE_PRESENCIAL,
    });
    this.button = this.botao.el;
    this.button.addEventListener('click', () => this.ctx.updatePrefs({ presencial: !this.ctx.prefs.presencial }));
    this.botao.atualizar({ ligado: false });
  }

  render(): void {
    const ligado = this.ctx.prefs.presencial;
    if (ligado === this.aplicado) return;
    this.aplicado = ligado;
    this.botao.atualizar({ ligado });
    aplicarModo(ligado, this.ctx.world);
  }
}
