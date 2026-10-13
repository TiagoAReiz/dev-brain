// Campo "Assinatura" do Novo agente: um chip por conta (Claude e Codex). Reconcilia por id; oculto com menos de 2 opções.
import type { UiContext } from '../../ui/context';
import { h, setAttr, setHidden, setStyleVar, setText, setTitle } from '../../ui/dom';
import { type OpcaoAssinatura, assinaturaInicial, opcoesAssinatura } from './modelo';
import './assinatura.css';

const PREF_KEY = 'habblaud.spawn.account';

interface NoChip {
  btn: HTMLButtonElement;
  ponto: HTMLElement;
  short: HTMLElement;
  nome: HTMLElement;
  fonte: HTMLElement;
}

function lerPref(): string | null {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

function gravarPref(id: string): void {
  try {
    localStorage.setItem(PREF_KEY, id);
  } catch {
    // sem armazenamento: só não lembra
  }
}

export class SeletorAssinatura {
  readonly el: HTMLElement;
  private readonly grupo: HTMLElement;
  private readonly chips = new Map<string, NoChip>();
  private opcoes: OpcaoAssinatura[] = [];
  private escolhida: string | null = null;

  constructor(
    private readonly ctx: UiContext,
    private readonly onChange: () => void,
  ) {
    const rotulo = h('span', { class: 'dbs-rotulo', text: 'Assinatura' });
    this.grupo = h('div', { class: 'dbs-chips', role: 'radiogroup', attrs: { 'aria-label': 'Assinatura' } });
    this.el = h('div', { class: 'dbs-seletor', hidden: true }, rotulo, this.grupo);
    // Setas movem a escolha entre os chips disponíveis.
    this.grupo.addEventListener('keydown', (ev) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) return;
      const lista = this.opcoes.filter((o) => o.disponivel);
      const i = lista.findIndex((o) => o.id === this.escolhida);
      if (i < 0 || lista.length < 2) return;
      const passo = ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 1;
      ev.preventDefault();
      const prox = lista[(i + passo + lista.length) % lista.length];
      this.escolher(prox.id);
      this.chips.get(prox.id)?.btn.focus();
    });
  }

  /** Relê o snapshot (contas e terminal interativo) e reconcilia os chips. */
  render(): void {
    const snap = this.ctx.store.snapshot;
    this.opcoes = opcoesAssinatura(snap?.accounts, snap?.meta.pty?.enabled === true);
    if (!this.escolhida || !this.opcoes.some((o) => o.id === this.escolhida && o.disponivel)) {
      this.escolhida = assinaturaInicial(this.opcoes, lerPref());
    }
    setHidden(this.el, this.opcoes.length < 2);

    const vivos = new Set(this.opcoes.map((o) => o.id));
    for (const [id, no] of this.chips) {
      if (vivos.has(id)) continue;
      no.btn.remove();
      this.chips.delete(id);
    }
    const nos: HTMLElement[] = [];
    for (const op of this.opcoes) {
      let no = this.chips.get(op.id);
      if (!no) {
        no = this.criar(op.id);
        this.chips.set(op.id, no);
      }
      this.atualizar(no, op);
      nos.push(no.btn);
    }
    let cursor: ChildNode | null = this.grupo.firstChild;
    for (const n of nos) {
      if (n === cursor) cursor = cursor.nextSibling;
      else this.grupo.insertBefore(n, cursor);
    }
  }

  selecionada(): OpcaoAssinatura | undefined {
    return this.opcoes.find((o) => o.id === this.escolhida);
  }

  private criar(id: string): NoChip {
    const ponto = h('span', { class: 'dbs-chip__ponto', attrs: { 'aria-hidden': 'true' } });
    const short = h('span', { class: 'dbs-chip__short' });
    const nome = h('span', { class: 'dbs-chip__nome' });
    const fonte = h('span', { class: 'dbs-chip__fonte' });
    const btn = h(
      'button',
      { class: 'dbs-chip', type: 'button', role: 'radio', attrs: { 'aria-checked': 'false' }, on: { click: () => this.escolher(id) } },
      ponto,
      short,
      nome,
      fonte,
    );
    return { btn, ponto, short, nome, fonte };
  }

  private atualizar(no: NoChip, op: OpcaoAssinatura): void {
    const marcada = op.id === this.escolhida;
    setStyleVar(no.btn, '--dbs-cor', op.cor);
    setText(no.short, op.short);
    setText(no.nome, op.nome);
    setText(no.fonte, op.fonte);
    setAttr(no.btn, 'aria-checked', String(marcada));
    setAttr(no.btn, 'tabindex', marcada || (!this.escolhida && op.disponivel) ? '0' : '-1');
    no.btn.classList.toggle('is-on', marcada);
    if (no.btn.disabled !== !op.disponivel) no.btn.disabled = !op.disponivel;
    setTitle(no.btn, op.motivo ?? op.detalhe);
  }

  private escolher(id: string): void {
    const op = this.opcoes.find((o) => o.id === id);
    if (!op?.disponivel || id === this.escolhida) return;
    this.escolhida = id;
    gravarPref(id);
    this.render();
    this.onChange();
  }
}
