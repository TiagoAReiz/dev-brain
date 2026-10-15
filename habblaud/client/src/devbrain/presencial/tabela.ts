// Painel do modo presencial: um cartão por projeto, com resumo, agentes e subagentes. Reconcilia por roomId e agentId.
import type { UiComponent, UiContext } from '../../ui/context';
import { h, setAttr, setHidden, setText, setTitle } from '../../ui/dom';
import { atualizarChip, chipModelo } from '../modelo/atalho';
import { focusPermission } from '../../ui/permission';
import { type AgenteCartao, type CartaoProjeto, type FiltroPresencial, cartoesPresencial, resumoCartao, resumoPresencial } from './cartoes';
import './presencial.css';

const FILTROS: { id: FiltroPresencial; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'esperando', rotulo: 'Precisa de você' },
  { id: 'trabalhando', rotulo: 'Trabalhando' },
  { id: 'ociosos', rotulo: 'Ociosos' },
];

interface NoAgente {
  li: HTMLLIElement;
  ponto: HTMLElement;
  nome: HTMLElement;
  atividade: HTMLElement;
  desde: HTMLElement;
  modelo: HTMLButtonElement;
  responder: HTMLButtonElement;
}

interface NoCartao {
  el: HTMLElement;
  topo: HTMLElement;
  nome: HTMLElement;
  resumo: HTMLElement;
  lista: HTMLUListElement;
  agentes: Map<string, NoAgente>;
}

interface NoChip {
  btn: HTMLButtonElement;
  n: HTMLElement;
}

/** Reordena os filhos de `pai` para seguir `nos`, mexendo só no que saiu do lugar. */
function ordenar(pai: HTMLElement, nos: HTMLElement[]): void {
  let cursor: ChildNode | null = pai.firstChild;
  for (const n of nos) {
    if (n === cursor) cursor = cursor.nextSibling;
    else pai.insertBefore(n, cursor);
  }
}

export class TabelaPresencial implements UiComponent {
  readonly el: HTMLElement;
  private grade: HTMLElement;
  private vazio: HTMLElement;
  private vazioTexto: HTMLElement;
  private verTodos: HTMLButtonElement;
  private chips = new Map<FiltroPresencial, NoChip>();
  private cartoes = new Map<string, NoCartao>();
  private filtro: FiltroPresencial = 'todos';
  private recolhidos = new Set<string>();

  constructor(private ctx: UiContext) {
    const resumo = h('div', { class: 'dbp-resumo', role: 'group', attrs: { 'aria-label': 'Filtrar agentes' } });
    for (const f of FILTROS) {
      const n = h('span', { class: 'dbp-chip__n', text: '0' });
      const btn = h(
        'button',
        { class: `dbp-chip dbp-chip--${f.id}`, type: 'button', attrs: { 'aria-pressed': 'false' }, on: { click: () => this.filtrar(f.id) } },
        h('span', { class: 'dbp-chip__rot', text: f.rotulo }),
        n,
      );
      this.chips.set(f.id, { btn, n });
      resumo.append(btn);
    }

    this.grade = h('div', { class: 'dbp-grade' });
    this.vazioTexto = h('p', { class: 'dbp-vazio__texto', text: 'Nenhuma sessão ativa' });
    this.verTodos = h('button', { class: 'dbp-vazio__btn', type: 'button', text: 'Ver todos', hidden: true, on: { click: () => this.filtrar('todos') } });
    this.vazio = h('div', { class: 'dbp-vazio', hidden: true }, this.vazioTexto, this.verTodos);

    this.el = h('section', { class: 'dbp-painel', hidden: true, attrs: { 'aria-label': 'Agentes' } }, resumo, this.grade, this.vazio);

    // Setas cima/baixo movem o foco entre os agentes visíveis; Enter seleciona.
    this.grade.addEventListener('keydown', (ev) => {
      const alvo = ev.target as HTMLElement;
      if (!alvo.classList.contains('dbp-agente')) return;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        const todos = Array.from(this.grade.querySelectorAll<HTMLElement>('.dbp-cartao:not(.is-recolhido) .dbp-agente'));
        const i = todos.indexOf(alvo) + (ev.key === 'ArrowDown' ? 1 : -1);
        if (todos[i]) todos[i].focus();
        ev.preventDefault();
      } else if (ev.key === 'Enter') {
        this.selecionar(alvo.dataset.key ?? '');
        ev.preventDefault();
      }
    });
  }

  render(): void {
    const ligado = this.ctx.prefs.presencial;
    setHidden(this.el, !ligado);
    if (!ligado) return;

    const snap = this.ctx.store.snapshot;
    const agora = this.ctx.now();

    // Chips com contagem geral.
    const r = resumoPresencial(snap, agora);
    const contagem: Record<FiltroPresencial, number> = { todos: r.total, esperando: r.esperando, trabalhando: r.trabalhando, ociosos: r.ociosos };
    for (const f of FILTROS) {
      const c = this.chips.get(f.id);
      if (!c) continue;
      setText(c.n, String(contagem[f.id]));
      setAttr(c.btn, 'aria-pressed', String(this.filtro === f.id));
      c.btn.classList.toggle('is-on', this.filtro === f.id);
      c.btn.classList.toggle('is-alerta', f.id === 'esperando' && r.esperando > 0);
    }

    // Cartões por roomId.
    const lista = cartoesPresencial(snap, agora, this.filtro);
    const ids = new Set(lista.map((c) => c.roomId));
    for (const [id, no] of this.cartoes) {
      if (!ids.has(id)) {
        no.el.remove();
        this.cartoes.delete(id);
      }
    }
    const nos: HTMLElement[] = [];
    for (const c of lista) {
      let no = this.cartoes.get(c.roomId);
      if (!no) {
        no = this.criarCartao(c.roomId);
        this.cartoes.set(c.roomId, no);
      }
      this.atualizarCartao(no, c);
      nos.push(no.el);
    }
    ordenar(this.grade, nos);

    // Estados vazios.
    const semAgentes = r.total === 0;
    setHidden(this.vazio, lista.length > 0);
    setText(this.vazioTexto, semAgentes ? 'Nenhuma sessão ativa' : 'Nenhum agente nesse filtro');
    setHidden(this.verTodos, semAgentes || this.filtro === 'todos');
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

  private filtrar(f: FiltroPresencial): void {
    if (this.filtro === f) return;
    this.filtro = f;
    this.render();
  }

  private selecionar(id: string): void {
    if (id) this.ctx.select({ type: 'agent', id });
  }

  private alternar(roomId: string): void {
    if (this.recolhidos.has(roomId)) this.recolhidos.delete(roomId);
    else this.recolhidos.add(roomId);
    this.render();
  }

  private criarCartao(roomId: string): NoCartao {
    const chevron = h('span', { class: 'dbp-cartao__chevron', attrs: { 'aria-hidden': 'true' } });
    const nome = h('h3', { class: 'dbp-cartao__nome' });
    const resumo = h('p', { class: 'dbp-cartao__resumo' });
    const topo = h(
      'header',
      {
        class: 'dbp-cartao__topo',
        role: 'button',
        tabIndex: 0,
        attrs: { 'aria-expanded': 'true' },
        on: {
          click: () => this.alternar(roomId),
          keydown: (ev) => {
            if (ev.target !== topo) return;
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              this.alternar(roomId);
            }
          },
        },
      },
      chevron,
      h('div', { class: 'dbp-cartao__titulo' }, nome, resumo),
    );
    const lista = h('ul', { class: 'dbp-agentes' });
    const el = h('article', { class: 'dbp-cartao' }, topo, lista);
    el.dataset.key = roomId;
    return { el, topo, nome, resumo, lista, agentes: new Map() };
  }

  private atualizarCartao(no: NoCartao, c: CartaoProjeto): void {
    setText(no.nome, c.nome);
    setTitle(no.nome, c.nome);
    setText(no.resumo, resumoCartao(c));
    const recolhido = this.recolhidos.has(c.roomId);
    no.el.classList.toggle('dbp-cartao--urgente', c.urgente);
    no.el.classList.toggle('is-recolhido', recolhido);
    setAttr(no.topo, 'aria-expanded', String(!recolhido));
    setHidden(no.lista, recolhido);

    const ids = new Set(c.agentes.map((a) => a.agentId));
    for (const [id, a] of no.agentes) {
      if (!ids.has(id)) {
        a.li.remove();
        no.agentes.delete(id);
      }
    }
    const nos: HTMLElement[] = [];
    for (const ag of c.agentes) {
      let a = no.agentes.get(ag.agentId);
      if (!a) {
        a = this.criarAgente(ag.agentId);
        no.agentes.set(ag.agentId, a);
      }
      this.atualizarAgente(a, ag);
      nos.push(a.li);
    }
    ordenar(no.lista, nos);
  }

  private criarAgente(id: string): NoAgente {
    const ponto = h('span', { class: 'dbp-ponto', attrs: { 'aria-hidden': 'true' } });
    const nome = h('span', { class: 'dbp-agente__nome' });
    const atividade = h('span', { class: 'dbp-agente__atividade' });
    const desde = h('span', { class: 'dbp-agente__desde' });
    const modelo = chipModelo(() => id);
    const responder = h('button', {
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
    });
    const li = h(
      'li',
      { class: 'dbp-agente', tabIndex: 0, on: { click: () => this.selecionar(id) } },
      h('div', { class: 'dbp-agente__linha' }, ponto, nome, modelo, atividade, desde, responder),
    );
    li.dataset.key = id;
    return { li, ponto, nome, modelo, atividade, desde, responder };
  }

  private atualizarAgente(a: NoAgente, ag: AgenteCartao): void {
    setText(a.nome, ag.nome);
    const pc = `dbp-ponto dbp-ponto--${ag.status}`;
    if (a.ponto.className !== pc) a.ponto.className = pc;
    setAttr(a.ponto, 'title', ag.statusTexto);
    // Esperando com motivo: só o motivo (a atividade repetiria "Precisa de você: ...").
    const texto = ag.motivo ?? ag.atividade;
    setText(a.atividade, texto);
    setTitle(a.atividade, texto);
    setText(a.desde, ag.desde);
    atualizarChip(a.modelo, ag.modeloCompleto || undefined, ag.modelo, !ag.sub);
    a.li.classList.toggle('dbp-agente--sub', ag.sub);
    a.li.classList.toggle('dbp-agente--calmo', ag.status === 'idle' || ag.status === 'done');
    a.li.classList.toggle('dbp-agente--urgente', ag.urgente);
    a.li.classList.toggle('dbp-agente--espera', !!ag.motivo);
    setHidden(a.responder, !ag.responder);
  }
}
