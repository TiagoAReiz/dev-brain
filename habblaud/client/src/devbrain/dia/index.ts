import type { PtyInfo } from '../../../../shared/types';
import { access } from '../../net/access';
import type { UiContext } from '../../ui/context';
import { h } from '../../ui/dom';
import { diaApi, type Inicio, type Relatorio, type Repo, type Resumo } from './api';
import { filtrarRepos, motivoIndisponivel, validarNome } from './modelo';
import './dia.css';

/** Fluxo independente do snapshot: o relatório continua legível depois que o servidor desliga. */
export class CicloDia {
  readonly iniciarButton: HTMLButtonElement;
  readonly finalizarButton: HTMLButtonElement;
  readonly el: HTMLDialogElement;
  private readonly title = h('h2', { attrs: { id: 'dbd-title' } });
  private readonly body = h('div', { class: 'dbd-body' });
  private readonly message = h('p', { class: 'dbd-status', role: 'status', attrs: { 'aria-live': 'polite' } });
  private readonly close = this.button('Cancelar', () => this.hide());
  private anchor?: HTMLButtonElement;
  private busy = false;
  private done = false;
  private epoch = 0;

  constructor(private readonly ctx: UiContext, private readonly abrirPty: (info: PtyInfo) => void) {
    this.iniciarButton = this.button('Iniciar dia', () => this.openStart());
    this.finalizarButton = this.button('Finalizar dia', () => void this.openFinish());
    for (const b of [this.iniciarButton, this.finalizarButton]) {
      b.classList.add('dbd-header-button');
      b.setAttribute('aria-haspopup', 'dialog');
      b.setAttribute('aria-controls', 'dbd-dialog');
    }
    this.el = h('dialog', { class: 'dbd-dialog', attrs: { id: 'dbd-dialog', 'aria-labelledby': 'dbd-title' } },
      h('header', { class: 'dbd-head' }, this.title, this.close), this.body, this.message);
    this.el.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.hide();
    });
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      if (e.key === 'Tab') this.trapFocus(e);
    });
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.render();
  }

  render(): void {
    const reason = this.unavailable();
    for (const [button, label] of [[this.iniciarButton, 'Iniciar dia'], [this.finalizarButton, 'Finalizar dia']] as const) {
      button.disabled = !!reason || this.busy || this.done;
      const hint = this.done ? 'Dia encerrado. Abra brain para começar novamente.' : reason;
      // O motivo continua visível mesmo para quem não usa hover ou leitor de tela.
      button.textContent = hint ? `${label} · ${hint}` : label;
      button.title = hint || label;
    }
    if (this.el.open && !this.done) {
      for (const control of this.body.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select')) {
        control.disabled = this.busy || !!reason;
      }
      this.close.disabled = this.busy;
    }
  }

  private unavailable(): string {
    const a = access();
    return motivoIndisponivel({ replay: this.ctx.store.replaying, remote: a.remote, local: a.local,
      terminal: !!this.ctx.store.snapshot?.meta.pty?.enabled,
      reason: this.ctx.store.snapshot?.meta.pty?.reason });
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    return h('button', { class: 'ui-btn dbd-button', type: 'button', text: label, on: { click: action } });
  }

  private say(text: string, error = false): void {
    this.message.textContent = text;
    this.message.setAttribute('role', error ? 'alert' : 'status');
    this.message.classList.toggle('dbd-error', error);
  }

  private show(title: string, anchor: HTMLButtonElement): void {
    this.anchor = anchor;
    this.title.textContent = title;
    this.close.textContent = 'Cancelar';
    this.close.disabled = this.busy;
    this.say('');
    if (!this.el.open) this.el.showModal();
    anchor.setAttribute('aria-expanded', 'true');
  }

  private focusFirst(): void {
    // Executado depois da substituição do conteúdo, sem roubar foco a cada renderização do escritório.
    const first = this.body.querySelector<HTMLElement>('input:not(:disabled),button:not(:disabled),select:not(:disabled)');
    (first ?? this.close).focus();
  }

  private hide(force = false): void {
    if (this.busy && !force) return;
    ++this.epoch; // consultas anteriores não alteram um modal reaberto
    this.el.close();
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.anchor?.focus();
  }

  private trapFocus(e: KeyboardEvent): void {
    const controls = [...this.el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
    if (!controls.length) { e.preventDefault(); this.el.focus(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  private openStart(): void {
    if (this.unavailable() || this.busy || this.done) return;
    ++this.epoch;
    this.show('Iniciar dia', this.iniciarButton);
    this.choice();
  }

  private choice(): void {
    this.say('');
    this.body.replaceChildren(h('p', { text: 'O que você quer trabalhar hoje?' }),
      h('div', { class: 'dbd-actions' }, this.button('Continuar um projeto', () => void this.loadRepos()), this.button('Criar projeto', () => this.createForm())));
    this.focusFirst();
  }

  private async loadRepos(): Promise<void> {
    const ticket = ++this.epoch;
    this.body.replaceChildren(h('p', { text: 'Carregando seus projetos…' }));
    this.say('');
    try {
      const repos = await diaApi.repos();
      if (ticket !== this.epoch || !this.el.open) return;
      this.repoList(repos);
    } catch (error) {
      if (ticket !== this.epoch || !this.el.open) return;
      this.say((error as Error).message, true);
      this.body.replaceChildren(this.button('Tentar novamente', () => void this.loadRepos()), this.button('Voltar', () => this.choice()));
      this.focusFirst();
    }
  }

  private repoList(repos: Repo[]): void {
    const search = h('input', { class: 'dbd-input', type: 'search', attrs: { id: 'dbd-search', placeholder: 'Nome ou dono do projeto', autocomplete: 'off' } });
    const list = h('ul', { class: 'dbd-list', attrs: { 'aria-label': 'Projetos' } });
    const count = h('p', { class: 'dbd-muted', role: 'status' });
    const update = () => {
      const filtered = filtrarRepos(repos, search.value);
      count.textContent = filtered.length ? `${filtered.length} projetos` : 'Nenhum projeto encontrado.';
      list.replaceChildren(...filtered.map((repo) => h('li', {},
        this.button(`${repo.repo}${repo.temMemoria ? ' · com memória' : ''}${repo.local ? ' · neste computador' : ''}`, () => void this.start({ repo: repo.repo })) )));
      this.render();
    };
    search.addEventListener('input', update);
    this.body.replaceChildren(this.button('Voltar', () => this.choice()), h('label', { text: 'Buscar projeto', attrs: { for: 'dbd-search' } }), search, count, list);
    update();
    this.focusFirst();
    search.focus();
  }

  private createForm(): void {
    this.say('');
    const name = h('input', { class: 'dbd-input', attrs: { id: 'dbd-name', maxlength: 100, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'meu-projeto' } });
    const visibility = h('select', { class: 'dbd-input', attrs: { id: 'dbd-visibility' } },
      h('option', { text: 'Privado', attrs: { value: 'private' } }), h('option', { text: 'Público', attrs: { value: 'public' } }));
    visibility.value = 'private';
    const submit = h('button', { class: 'ui-btn dbd-button dbd-primary', type: 'submit', text: 'Criar projeto' });
    const form = h('form', { class: 'dbd-form' },
      h('label', { text: 'Nome do projeto', attrs: { for: 'dbd-name' } }), name,
      h('p', { class: 'dbd-muted', text: 'Letras minúsculas, números e hífens entre palavras.' }),
      h('label', { text: 'Visibilidade no GitHub', attrs: { for: 'dbd-visibility' } }), visibility, submit);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.busy) return;
      const error = validarNome(name.value);
      if (error) { this.say(error, true); name.focus(); return; }
      void this.start({ nome: name.value, visibilidade: visibility.value === 'public' ? 'public' : 'private' });
    });
    this.body.replaceChildren(this.button('Voltar', () => this.choice()), form);
    this.render();
    name.focus();
  }

  private async start(input: Inicio): Promise<void> {
    if (this.busy || this.unavailable() || this.done) return;
    this.busy = true;
    this.say('Preparando o projeto e abrindo o Claude…');
    this.render();
    try {
      const result = await diaApi.iniciar(input);
      this.busy = false;
      this.hide(true);
      this.abrirPty(result.pty);
      this.ctx.announce('Projeto aberto no terminal.');
    } catch (error) {
      this.say((error as Error).message, true);
    } finally {
      this.busy = false;
      this.render();
      if (this.el.open) this.focusFirst();
    }
  }

  private async openFinish(): Promise<void> {
    if (this.unavailable() || this.busy || this.done) return;
    const ticket = ++this.epoch;
    this.show('Finalizar dia', this.finalizarButton);
    this.body.replaceChildren(h('p', { text: 'Conferindo sessões, projetos e memória…' }));
    this.close.focus();
    try {
      const resumo = await diaApi.resumo();
      if (ticket !== this.epoch || !this.el.open) return;
      this.summary(resumo);
    } catch (error) {
      if (ticket !== this.epoch || !this.el.open) return;
      this.say((error as Error).message, true);
      this.body.replaceChildren(this.button('Tentar novamente', () => void this.openFinish()));
      this.focusFirst();
    }
  }

  private section(title: string, lines: string[], empty: string): HTMLElement {
    return h('section', { class: 'dbd-section' }, h('h3', { text: title }),
      lines.length ? h('ul', { class: 'dbd-details' }, ...lines.map((text) => h('li', { text }))) : h('p', { class: 'dbd-muted', text: empty }));
  }

  private summary(resumo: Resumo): void {
    this.body.replaceChildren(
      h('p', { text: 'Ao confirmar, as sessões locais do Claude serão encerradas. Os projetos e a memória serão salvos; pastas com riscos serão mantidas. Ao fim, o Habblaud desliga.' }),
      this.section('Sessões que serão encerradas', resumo.sessoes.map((s) => `${s.nome} · ${s.cwd}`), 'Nenhuma sessão aberta.'),
      this.section('Projetos', resumo.repos.map((r) => `${r.nome} · ${r.pendente} arquivos pendentes · ${r.commits} commits${r.riscos.length ? ` · Mantido: ${r.riscos.join('; ')}` : ''}`), 'Nenhum projeto no workfolder.'),
      this.section('Itens que serão mantidos', resumo.avulsos, 'Nenhum arquivo avulso.'),
      this.section('Agentes não gerenciados', resumo.naoGerenciadas.map((s) => s.nome), 'Nenhum agente não gerenciado.'),
      this.section('Memória do dev-brain', [`${resumo.memoria.mudancas} arquivos pendentes · ${resumo.memoria.commits} commits`], ''),
      this.button('Finalizar dia', () => void this.finish()));
    this.render();
    // A confirmação não recebe foco inicial, evitando confirmar por Enter acidental.
    this.close.focus();
  }

  private async finish(): Promise<void> {
    if (this.busy || this.unavailable() || this.done) return;
    this.busy = true;
    this.say('Finalizando: aguardando o encerramento das sessões e o salvamento dos projetos. Isso pode levar alguns minutos.');
    this.render();
    this.message.tabIndex = -1;
    this.message.focus();
    try {
      const report = await diaApi.finalizar();
      this.done = true;
      this.report(report);
    } catch (error) {
      this.say((error as Error).message, true);
    } finally {
      this.busy = false;
      this.render();
      if (!this.done) this.close.focus();
    }
  }

  private report(report: Relatorio): void {
    this.title.textContent = 'Dia encerrado';
    this.close.textContent = 'Fechar relatório';
    this.close.disabled = false;
    this.say('Até amanhã. Para iniciar outro dia, abra o Dev Brain no menu ou rode brain no terminal.');
    this.body.replaceChildren(
      this.section('Salvos', report.salvos, 'Nenhum projeto salvo.'),
      this.section('Mantidos neste computador', report.mantidos.map((r) => `${r.nome} · ${r.motivo}`), 'Nenhuma pasta mantida.'),
      this.section('Memória do dev-brain', [report.memoria.salva ? 'Salva no GitHub.' : `Mantida: ${report.memoria.motivo ?? 'Confira a memória antes de sair.'}`], ''),
      h('p', { text: `Relatório salvo em ${report.relatorioPath}`, class: 'dbd-path' }),
      h('p', { class: 'dbd-muted', text: `O Habblaud desliga em ${report.desligaEm} segundos. Este relatório permanece nesta janela.` }));
    this.close.focus();
  }
}
