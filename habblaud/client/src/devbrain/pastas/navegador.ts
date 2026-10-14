// Painel inline para navegar pelas pastas do computador (via GET /api/spawn/browse) e escolher uma.
import { tr } from '../../../../shared/i18n';
import { h, setHidden, setText } from '../../ui/dom';
import { atalhos, migalhas, urlNavegar } from './modelo';
import './pastas.css';

// Resposta da API (mesmo formato de server/spawn/browse.ts; tipo próprio no cliente).
interface BrowseEntry {
  name: string;
  path: string;
}
interface BrowseResult {
  path: string;
  parent: string | null;
  home: string;
  entries: BrowseEntry[];
  truncated: boolean;
}

export class NavegadorPastas {
  readonly el: HTMLElement;
  private readonly migalhasEl: HTMLElement;
  private readonly atalhosEl: HTMLElement;
  private readonly subir: HTMLButtonElement;
  private readonly lista: HTMLElement;
  private readonly aviso: HTMLElement;
  private readonly erroEl: HTMLElement;
  private readonly ocultasChk: HTMLInputElement;
  private readonly caminhoEl: HTMLElement;
  private readonly usar: HTMLButtonElement;
  private atual: BrowseResult | null = null;
  private seq = 0;
  // Esc no document (captura): vale mesmo com o foco fora do painel (ex.: BODY após re-render).
  private readonly aoEsc = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    this.fechar();
  };

  constructor(private readonly opts: { onEscolher: (caminho: string) => void }) {
    this.migalhasEl = h('nav', { class: 'dbf-migalhas', attrs: { 'aria-label': tr('Caminho') } });
    this.atalhosEl = h('div', { class: 'dbf-atalhos' });
    this.subir = h('button', { class: 'dbf-linha dbf-subir', type: 'button', hidden: true, text: tr('↑ Subir'), on: { click: () => this.subirNivel() } });
    this.lista = h('ul', { class: 'dbf-lista', attrs: { 'aria-label': tr('Subpastas') } });
    this.aviso = h('p', { class: 'dbf-aviso', role: 'status', hidden: true });
    this.erroEl = h('p', { class: 'dbf-erro', role: 'alert', hidden: true });
    this.ocultasChk = h('input', { type: 'checkbox', on: { change: () => this.carregar(this.atual?.path) } });
    this.caminhoEl = h('code', { class: 'dbf-caminho' });
    this.usar = h('button', { class: 'dbf-btn dbf-btn--primario', type: 'button', text: tr('Usar esta pasta'), on: { click: () => this.confirmar() } });
    const cancelar = h('button', { class: 'dbf-btn', type: 'button', text: tr('Cancelar'), on: { click: () => this.fechar() } });
    const ocultas = h('label', { class: 'dbf-ocultas' }, this.ocultasChk, h('span', { text: tr('Mostrar ocultas') }));

    this.el = h(
      'section',
      { class: 'dbf-painel', hidden: true, attrs: { 'aria-label': tr('Escolher pasta') } },
      h('div', { class: 'dbf-topo' }, this.atalhosEl, ocultas),
      this.migalhasEl,
      this.erroEl,
      this.aviso,
      this.subir,
      this.lista,
      h('div', { class: 'dbf-rodape' }, this.caminhoEl, h('div', { class: 'dbf-acoes' }, cancelar, this.usar)),
    );
  }

  get aberto(): boolean {
    return !this.el.hidden;
  }

  /** Mostra o painel e carrega `inicial` (se falhar, tenta a home). */
  abrir(inicial?: string): void {
    this.atual = null;
    this.esvaziar();
    setHidden(this.el, false);
    // mesma referência e mesmo flag de captura: não duplica o listener se já estiver aberto
    document.addEventListener('keydown', this.aoEsc, true);
    this.carregar(inicial?.trim() || undefined, true);
  }

  fechar(): void {
    this.seq++; // descarta resposta em voo
    document.removeEventListener('keydown', this.aoEsc, true);
    setHidden(this.el, true);
  }

  private confirmar(): void {
    if (!this.atual) return;
    const caminho = this.atual.path;
    this.fechar();
    this.opts.onEscolher(caminho);
  }

  private subirNivel(): void {
    if (this.atual?.parent) this.carregar(this.atual.parent);
  }

  private carregar(caminho: string | undefined, tentarHome = false): void {
    const id = ++this.seq;
    this.el.setAttribute('aria-busy', 'true');
    this.lista.classList.add('is-carregando');
    if (!this.atual) this.mostrarAviso(tr('Carregando…'));
    void this.buscar(id, caminho, tentarHome);
  }

  private async buscar(id: number, caminho: string | undefined, tentarHome: boolean): Promise<void> {
    try {
      const res = await fetch(urlNavegar(caminho, this.ocultasChk.checked), { credentials: 'same-origin', cache: 'no-store' });
      let corpo: unknown = null;
      try {
        corpo = await res.json();
      } catch {
        // corpo inválido: cai na mensagem genérica
      }
      if (id !== this.seq) return;
      if (!res.ok) {
        const msg = (corpo as { error?: string } | null)?.error;
        throw new Error(msg || tr('Não foi possível listar a pasta'));
      }
      this.atual = corpo as BrowseResult;
      this.render();
    } catch (err) {
      if (id !== this.seq) return;
      // pasta inicial inválida: tenta a home (sem caminho)
      if (tentarHome && caminho && !this.atual) {
        this.carregar(undefined);
        return;
      }
      this.falhar(err instanceof Error ? err.message : String(err));
    }
  }

  private falhar(msg: string): void {
    this.el.removeAttribute('aria-busy');
    this.lista.classList.remove('is-carregando');
    // mantém a lista anterior; sem lista, mostra só o erro
    setText(this.erroEl, msg);
    setHidden(this.erroEl, false);
    if (!this.atual) setHidden(this.aviso, true);
  }

  private esvaziar(): void {
    this.lista.replaceChildren();
    this.migalhasEl.replaceChildren();
    this.atalhosEl.replaceChildren();
    setHidden(this.subir, true);
    setHidden(this.erroEl, true);
    setHidden(this.aviso, true);
    setText(this.caminhoEl, '');
    this.usar.disabled = true;
  }

  private mostrarAviso(texto: string): void {
    setText(this.aviso, texto);
    setHidden(this.aviso, false);
  }

  private render(): void {
    const r = this.atual;
    if (!r) return;
    this.el.removeAttribute('aria-busy');
    this.lista.classList.remove('is-carregando');
    setHidden(this.erroEl, true);

    // migalhas
    const ms = migalhas(r.path);
    this.migalhasEl.replaceChildren(
      ...ms.map((m, i) =>
        h('button', {
          class: 'dbf-migalha',
          type: 'button',
          text: m.nome,
          attrs: { 'aria-label': tr('Ir para {0}', [m.caminho]), 'aria-current': i === ms.length - 1 ? 'location' : undefined },
          on: { click: () => this.carregar(m.caminho) },
        }),
      ),
    );
    // atalhos
    this.atalhosEl.replaceChildren(
      ...atalhos(r.home).map((a) => h('button', { class: 'dbf-atalho', type: 'button', text: a.nome, title: a.caminho, on: { click: () => this.carregar(a.caminho) } })),
    );
    setHidden(this.subir, r.parent === null);

    // subpastas
    this.lista.replaceChildren(
      ...r.entries.map((e) => h('li', {}, h('button', { class: 'dbf-linha', type: 'button', title: e.path, text: e.name, on: { click: () => this.carregar(e.path) } }))),
    );
    if (r.entries.length === 0) this.mostrarAviso(tr('Sem subpastas'));
    else if (r.truncated) this.mostrarAviso(tr('Mostrando as primeiras {0}', [r.entries.length]));
    else setHidden(this.aviso, true);

    setText(this.caminhoEl, r.path);
    this.caminhoEl.title = r.path;
    this.usar.disabled = false;
    this.lista.scrollTop = 0;
  }
}
