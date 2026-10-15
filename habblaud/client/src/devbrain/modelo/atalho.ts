// Atalho para trocar modelo e effort de um agente. O chip do modelo abre um menu com os modelos e os níveis de effort:
// agente aberto no terminal do Habblaud recebe `/model x` / `/effort y` digitado no terminal dele; os demais (com o
// plugin habblaud-mensagens) recebem o mesmo comando pelo canal de mensagens.
import type { PtyInfo } from '../../../../shared/types';
import type { UiContext } from '../../ui/context';
import { h } from '../../ui/dom';
import { postPty } from '../../ui/ptyapi';
import './atalho.css';

export type Seletor = 'model' | 'effort';

export const EVENTO_MODELO = 'devbrain:modelo';

export interface PedidoModelo {
  agentId: string;
  ancora: HTMLElement;
}

export type TomAviso = 'info' | 'ok' | 'erro';

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
export function chipModelo(agentId: () => string | null): HTMLButtonElement {
  const b = h('button', { class: 'dbm-chip', type: 'button' });
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = agentId();
    if (id) b.dispatchEvent(new CustomEvent<PedidoModelo>(EVENTO_MODELO, { bubbles: true, detail: { agentId: id, ancora: b } }));
  });
  return b;
}

/** Texto e dica do chip; subagente não troca de modelo (herda o do pai). */
export function atualizarChip(chip: HTMLButtonElement, modelo: string | undefined, bonito: string, trocavel: boolean): void {
  const texto = modelo ? bonito : '';
  if (chip.textContent !== texto) chip.textContent = texto;
  chip.hidden = !modelo;
  chip.disabled = !trocavel;
  const dica = trocavel ? `${modelo ?? ''} · clique para trocar modelo ou effort` : (modelo ?? '');
  if (chip.title !== dica) chip.title = dica;
  chip.setAttribute('aria-haspopup', trocavel ? 'menu' : 'false');
}

/** Espera o plugin de mensagens entregar (até ~8 s). */
async function esperarMensagem(id: string | undefined): Promise<{ tom: TomAviso; texto: string }> {
  if (!id) return { tom: 'ok', texto: 'Enviado.' };
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await fetch(`/api/messages/${encodeURIComponent(id)}`).catch(() => null);
    const m = (await res?.json().catch(() => null)) as { status?: string; error?: string } | null;
    if (m?.status === 'failed') return { tom: 'erro', texto: m.error ?? 'a sessão recusou o comando' };
    if (m?.status === 'sent' || m?.status === 'delivered') return { tom: 'ok', texto: 'Enviado. O chip atualiza no próximo turno do agente.' };
  }
  return { tom: 'info', texto: 'Enviado; a sessão ainda não confirmou.' };
}

export function instalarAtalhoModelo(ctx: UiContext): void {
  let menu: HTMLElement | null = null;
  let dono: HTMLElement | null = null;
  const fechar = (devolverFoco = false) => {
    menu?.remove();
    menu = null;
    dono?.setAttribute('aria-expanded', 'false');
    if (devolverFoco) dono?.focus();
    dono = null;
  };
  document.addEventListener('click', (ev) => {
    if (menu && !menu.contains(ev.target as Node)) fechar();
  });
  document.addEventListener('keydown', (ev) => {
    if (!menu) return;
    if (ev.key === 'Escape') return fechar(true);
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const itens = [...menu.querySelectorAll<HTMLButtonElement>('.dbm-op, .dbm-seg__op, .dbm-mais')];
    if (!itens.length) return;
    const i = itens.indexOf(document.activeElement as HTMLButtonElement);
    const prox = ev.key === 'ArrowDown' ? (i + 1) % itens.length : (i - 1 + itens.length) % itens.length;
    itens[prox]?.focus();
    ev.preventDefault();
  });

  document.addEventListener(EVENTO_MODELO, (ev) => {
    const { agentId, ancora } = (ev as CustomEvent<PedidoModelo>).detail;
    const reabrir = dono !== ancora;
    fechar();
    if (!reabrir) return; // segundo clique no mesmo chip fecha
    dono = ancora;
    ancora.setAttribute('aria-expanded', 'true');
    const agente = ctx.store.snapshot?.agents.find((a) => a.id === agentId);
    const pty = ptyVivo(ctx.store.snapshot?.ptys, agentId);
    const pelaMensagem = !pty && !!agente?.canMessage;
    const atual = agente?.model;

    const aviso = h('div', { class: 'dbm-aviso', hidden: true, attrs: { 'aria-live': 'polite' } });
    const dizer = (tom: TomAviso, texto: string) => {
      aviso.className = `dbm-aviso dbm-aviso--${tom}`;
      aviso.textContent = texto;
      aviso.hidden = false;
    };

    const enviar = async (qual: Seletor, valor = '') => {
      if (!pty) {
        if (!pelaMensagem) return dizer('erro', 'Sem terminal do Habblaud nem plugin de mensagens (npm run mod:install).');
        if (!valor) return dizer('info', 'O seletor do Claude Code só abre no terminal do Habblaud.');
        dizer('info', 'Enviando…');
        try {
          const msg = await postPty<{ id: string }>('/api/messages', { agentId, text: comandoSeletor(qual, valor).trim() });
          const r = await esperarMensagem(msg?.id);
          dizer(r.tom, r.texto);
        } catch (e) {
          dizer('erro', e instanceof Error ? e.message : 'Não enviou');
        }
        return;
      }
      fechar();
      ctx.terminals?.open(agentId);
      await postPty(`/api/pty/${encodeURIComponent(pty.id)}/input`, { data: comandoSeletor(qual, valor) }).catch(() => undefined);
    };

    const clique = (qual: Seletor, valor: string) => (e: Event) => {
      e.stopPropagation();
      void enviar(qual, valor);
    };
    const modelo = (o: OpcaoMenu) => {
      const marcado = modeloAtual(o, atual);
      return h(
        'button',
        {
          class: `dbm-op${marcado ? ' is-atual' : ''}`,
          type: 'button',
          role: 'menuitemradio',
          attrs: { 'aria-checked': String(marcado) },
          on: { click: clique('model', o.valor) },
        },
        h('span', { class: 'dbm-op__marca', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'dbm-op__nome', text: o.rotulo }),
        marcado ? h('span', { class: 'dbm-op__tag', text: 'atual' }) : null,
      );
    };
    const mais = (qual: Seletor) =>
      pty ? h('button', { class: 'dbm-mais', type: 'button', text: 'Outros…', title: 'Abre o seletor do Claude Code no terminal', on: { click: clique(qual, '') } }) : null;

    menu = h(
      'div',
      { class: 'dbm-menu', role: 'menu', attrs: { 'aria-label': 'Modelo e effort' } },
      h('div', { class: 'dbm-head' }, h('span', { class: 'dbm-head__nome', text: agente?.name ?? 'Agente' }), h('span', { class: 'dbm-head__via', text: pty ? 'via terminal' : 'via mensagem' })),
      h('div', { class: 'dbm-grupo' }, h('h3', { text: 'Modelo' }), ...MODELOS.map(modelo), mais('model')),
      h(
        'div',
        { class: 'dbm-grupo' },
        h('h3', { text: 'Effort' }),
        h(
          'div',
          { class: 'dbm-seg', role: 'group', attrs: { 'aria-label': 'Effort' } },
          ...EFFORTS.map((o) => h('button', { class: 'dbm-seg__op', type: 'button', text: o.rotulo, on: { click: clique('effort', o.valor) } })),
        ),
        mais('effort'),
      ),
      aviso,
    );
    ctx.root.append(menu);
    posicionar(menu, ancora);
    menu.querySelector<HTMLElement>('.dbm-op.is-atual, .dbm-op')?.focus();
  });
}

/** Embaixo do chip; sem espaço, em cima. Sempre dentro da janela. */
function posicionar(menu: HTMLElement, ancora: HTMLElement): void {
  const r = ancora.getBoundingClientRect();
  const w = menu.offsetWidth;
  const alto = menu.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const abaixo = r.bottom + 6;
  const top = abaixo + alto <= window.innerHeight - 8 ? abaixo : Math.max(8, r.top - alto - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
