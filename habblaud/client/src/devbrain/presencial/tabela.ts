// Tabela do modo presencial: uma linha por agente, no lugar do prédio. Linhas reconciliadas por agentId.
import type { UiComponent, UiContext } from '../../ui/context';
import { h, setHidden, setText } from '../../ui/dom';
import { focusPermission } from '../../ui/permission';
import { linhasPresencial, type LinhaPresencial } from './modelo';
import './presencial.css';

const COLUNAS = ['Projeto', 'Agente', 'Status', 'Atividade', 'Desde'];

interface Celulas {
  projeto: HTMLElement;
  nome: HTMLElement;
  status: HTMLElement;
  atividade: HTMLElement;
  desde: HTMLElement;
  responder: HTMLButtonElement;
}

export class TabelaPresencial implements UiComponent {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private vazio: HTMLElement;
  private linhas = new Map<string, { tr: HTMLTableRowElement; c: Celulas }>();

  constructor(private ctx: UiContext) {
    this.body = h('tbody');
    const head = h('tr', {}, ...COLUNAS.map((c) => h('th', { text: c, attrs: { scope: 'col' } })));
    this.vazio = h('p', { class: 'dbp-vazio', text: 'Nenhuma sessão ativa', hidden: true });
    this.el = h(
      'section',
      { class: 'dbp-tabela', hidden: true, attrs: { 'aria-label': 'Agentes' } },
      h('table', {}, h('thead', {}, head), this.body),
      this.vazio,
    );
    // Setas cima/baixo movem o foco entre as linhas.
    this.body.addEventListener('keydown', (ev) => {
      const tr = (ev.target as HTMLElement).closest('tr');
      if (!tr || ev.target !== tr) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        const alvo = ev.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
        if (alvo) (alvo as HTMLElement).focus();
        ev.preventDefault();
      } else if (ev.key === 'Enter') {
        this.selecionar(tr.dataset.key ?? '');
        ev.preventDefault();
      }
    });
  }

  render(): void {
    const ligado = this.ctx.prefs.presencial;
    setHidden(this.el, !ligado);
    if (!ligado) return;

    const linhas = linhasPresencial(this.ctx.store.snapshot, this.ctx.now());
    const ids = new Set(linhas.map((l) => l.agentId));
    for (const [id, r] of this.linhas) {
      if (!ids.has(id)) {
        r.tr.remove();
        this.linhas.delete(id);
      }
    }
    let cursor: ChildNode | null = this.body.firstChild;
    for (const l of linhas) {
      let r = this.linhas.get(l.agentId);
      if (!r) {
        r = this.criar(l.agentId);
        this.linhas.set(l.agentId, r);
      }
      this.atualizar(r.tr, r.c, l);
      if (r.tr !== cursor) this.body.insertBefore(r.tr, cursor);
      else cursor = cursor.nextSibling;
    }
    setHidden(this.vazio, linhas.length > 0);
    this.posicionar();
  }

  /** Entre a base do header e o topo do feed (se aberto). */
  private posicionar(): void {
    const topbar = this.ctx.root.querySelector('.ui-topbar');
    const feed = this.ctx.root.querySelector<HTMLElement>('.ui-feed');
    const top = topbar ? `${Math.round(topbar.getBoundingClientRect().bottom)}px` : '0px';
    const bottom = feed && this.ctx.isPanelOpen('feed') ? `${feed.offsetHeight}px` : '0px';
    if (this.el.style.top !== top) this.el.style.top = top;
    if (this.el.style.bottom !== bottom) this.el.style.bottom = bottom;
  }

  private selecionar(id: string): void {
    if (id) this.ctx.select({ type: 'agent', id });
  }

  private criar(id: string): { tr: HTMLTableRowElement; c: Celulas } {
    const c: Celulas = {
      projeto: h('td', { class: 'dbp-projeto' }),
      nome: h('td', { class: 'dbp-nome' }),
      status: h('span', { class: 'dbp-st' }),
      atividade: h('td', { class: 'dbp-atividade' }),
      desde: h('td', { class: 'dbp-desde' }),
      responder: h('button', {
        class: 'dbp-responder',
        type: 'button',
        text: 'Responder',
        hidden: true,
        on: {
          click: (ev) => {
            ev.stopPropagation();
            focusPermission(this.ctx, id);
          },
        },
      }),
    };
    const tr = h(
      'tr',
      { class: 'dbp-linha', tabIndex: 0, on: { click: () => this.selecionar(id) } },
      c.projeto,
      c.nome,
      h('td', { class: 'dbp-status' }, c.status),
      c.atividade,
      h('td', { class: 'dbp-desde-cel' }, c.desde, c.responder),
    );
    tr.dataset.key = id;
    return { tr, c };
  }

  private atualizar(tr: HTMLTableRowElement, c: Celulas, l: LinhaPresencial): void {
    setText(c.projeto, l.projeto ?? '');
    setText(c.nome, (l.sub ? '└ ' : '') + l.nome);
    setText(c.status, l.statusTexto);
    const cls = `dbp-st dbp-st--${l.status}`;
    if (c.status.className !== cls) c.status.className = cls;
    setText(c.atividade, l.atividade);
    setText(c.desde, l.desde);
    tr.classList.toggle('dbp-sub', l.sub);
    tr.classList.toggle('dbp-urgente', l.urgente);
    setHidden(c.responder, !(l.urgente && !!this.ctx.agent(l.agentId)?.permission));
  }
}
