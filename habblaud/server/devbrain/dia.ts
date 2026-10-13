import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { AgentInfo, OfficeSnapshot, PtyInfo } from '../../shared/types';
import type { PtyManager } from '../pty/manager';
import { log } from '../log';
import { DiaError, scrubProjectError, type Projeto, type ProjectRunner, type Repo, type ResumoCLI, type RelatorioCLI } from './project';

export type IniciarInput = { repo: string } | { nome: string; visibilidade?: 'private' | 'public' };
export interface Sessao { id: string; nome: string; cwd: string }
export interface ResumoDia extends ResumoCLI { sessoes: Sessao[]; naoGerenciadas: { id: string; nome: string; cwd?: string }[] }
export interface RelatorioDia extends RelatorioCLI { relatorioPath: string; desligaEm: 5 }
export interface DiaDeps {
  runner: ProjectRunner;
  ptys: Pick<PtyManager, 'status' | 'list' | 'create' | 'stopAndWait'>;
  snapshot: () => Pick<OfficeSnapshot, 'agents' | 'rooms'>;
  /** office.has distingue demo de processos reais, mesmo que IDs pareçam válidos. */
  isReal: (id: string) => boolean;
  persist: (report: RelatorioCLI) => Promise<string>;
  shutdown: () => void | Promise<void>;
  workfolder?: string;
  schedule?: (callback: () => void, ms: number) => unknown;
}

const repoOwner = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const repoName = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/;
export function parseIniciar(body: unknown): IniciarInput {
  if (!object(body)) throw new DiaError(400, 'informe um projeto para continuar ou criar');
  const keys = Object.keys(body);
  if (keys.length === 1 && typeof body.repo === 'string') {
    const segments = body.repo.split('/');
    if (segments.length === 2 && repoOwner.test(segments[0]) && repoName.test(segments[1]) && segments[1] !== '.' && segments[1] !== '..') return { repo: body.repo };
  }
  if (keys.every((k) => k === 'nome' || k === 'visibilidade') && typeof body.nome === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.nome) && body.nome.length <= 100 && (body.visibilidade === undefined || body.visibilidade === 'private' || body.visibilidade === 'public')) {
    return { nome: body.nome, visibilidade: body.visibilidade as 'private' | 'public' | undefined };
  }
  throw new DiaError(400, 'use {repo:"dono/repo"} ou {nome:"nome-do-projeto",visibilidade:"private"|"public"}');
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every((v) => typeof v === 'string'); }
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function invalid(): never { throw new DiaError(502, 'project devolveu um resultado incompleto; atualize o dev-brain'); }
function projeto(value: unknown): Projeto {
  if (!object(value) || typeof value.dir !== 'string' || !value.dir.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value.dir) || typeof value.memoria !== 'string' || typeof value.novaMemoria !== 'boolean' || !(value.prompt === null || typeof value.prompt === 'string')) return invalid();
  return value as unknown as Projeto;
}
function resumo(value: unknown): ResumoCLI {
  if (!object(value) || !Array.isArray(value.repos) || !object(value.memoria) || !count(value.memoria.mudancas) || !count(value.memoria.commits) || !strings(value.avulsos)) return invalid();
  if (!value.repos.every((v) => object(v) && typeof v.nome === 'string' && typeof v.dir === 'string' && count(v.pendente) && count(v.commits) && strings(v.riscos))) return invalid();
  return value as unknown as ResumoCLI;
}
function relatorio(value: unknown): RelatorioCLI {
  if (!object(value) || !strings(value.salvos) || !Array.isArray(value.mantidos) || !value.mantidos.every((v) => object(v) && typeof v.nome === 'string' && typeof v.motivo === 'string') || !object(value.memoria) || typeof value.memoria.salva !== 'boolean' || !(value.memoria.motivo === null || typeof value.memoria.motivo === 'string')) return invalid();
  return value as unknown as RelatorioCLI;
}

export class DiaService {
  private busy: 'iniciar' | 'finalizar' | null = null;
  private finishing?: Promise<RelatorioDia>;
  private finished?: RelatorioDia;
  private saved?: RelatorioCLI;
  private scheduled = false;
  /** Alvos que falharam continuam visíveis/encerráveis mesmo após o pai sumir do snapshot. */
  private pendingStops = new Map<string, Sessao>();
  constructor(private readonly deps: DiaDeps) {}
  get isFinalizing(): boolean { return this.busy === 'finalizar' || !!this.finished || !!this.saved; }

  available(): void {
    const status = this.deps.ptys.status();
    if (!status.enabled) throw new DiaError(403, `terminal interativo desligado: ${status.reason ?? 'veja o log do servidor'}`);
  }
  async repos(): Promise<Repo[]> {
    this.available();
    const data = await this.deps.runner(['repos', '--json']);
    if (!Array.isArray(data) || !data.every((v) => object(v) && typeof v.repo === 'string' && typeof v.nome === 'string' && typeof v.temMemoria === 'boolean' && typeof v.local === 'boolean')) return invalid();
    return data as Repo[];
  }

  private sessions(): Pick<ResumoDia, 'sessoes' | 'naoGerenciadas'> {
    const snap = this.deps.snapshot();
    const live = snap.agents.filter((a) => a.kind === 'main' && a.status !== 'offline' && a.status !== 'done');
    const byId = new Map(live.map((a) => [a.id, a]));
    const managed = new Map(this.pendingStops);
    const unmanaged = new Map<string, { id: string; nome: string; cwd?: string }>();
    for (const pty of this.deps.ptys.list()) {
      if (pty.exitedAt !== undefined) continue;
      managed.set(pty.agentId, { id: pty.agentId, nome: byId.get(pty.agentId)?.name ?? pty.cwd.split(/[\\/]/).pop() ?? pty.agentId, cwd: pty.cwd });
    }
    for (const agent of live) {
      if (managed.has(agent.id)) continue;
      if (this.manageable(agent)) {
        managed.set(agent.id, { id: agent.id, nome: agent.name, cwd: snap.rooms.find((r) => r.id === agent.roomId)?.path ?? '' });
      } else unmanaged.set(agent.id, { id: agent.id, nome: agent.name, cwd: snap.rooms.find((r) => r.id === agent.roomId)?.path });
    }
    return { sessoes: [...managed.values()], naoGerenciadas: [...unmanaged.values()] };
  }
  private manageable(a: AgentInfo): boolean {
    if (!this.deps.isReal(a.id) || (a.provider ?? 'claude') !== 'claude') return false;
    const split = a.id.lastIndexOf(':');
    const pid = Number(a.id.slice(split + 1));
    return split > 0 && a.id.slice(0, split) === a.account && Number.isSafeInteger(pid) && pid > 0;
  }
  async resumo(): Promise<ResumoDia> {
    this.available();
    if (this.busy) throw new DiaError(409, 'uma operação do dia está em andamento; aguarde');
    const cli = resumo(await this.deps.runner(['resumo', '--json']));
    return { ...cli, ...this.sessions() };
  }
  async iniciar(body: unknown): Promise<{ projeto: Projeto; pty: PtyInfo }> {
    const input = parseIniciar(body);
    this.available();
    if (this.busy || this.finished || this.saved) throw new DiaError(409, 'uma operação do dia está em andamento ou o dia já foi encerrado');
    this.busy = 'iniciar';
    try {
      const args = 'repo' in input ? ['preparar', input.repo, '--json'] : ['create', input.nome, `--${input.visibilidade ?? 'private'}`, '--sem-claude', '--json'];
      const project = projeto(await this.deps.runner(args));
      let pty: PtyInfo;
      try { pty = this.deps.ptys.create({ cwd: project.dir, ...(project.prompt === null ? {} : { prompt: project.prompt }) }); }
      catch { throw new DiaError(502, `projeto preparado em ${project.dir}, mas o terminal não abriu; continue com claude nessa pasta`); }
      return { projeto: project, pty };
    } finally { this.busy = null; }
  }
  finalizar(): Promise<RelatorioDia> {
    if (this.finishing) return this.finishing;
    if (this.finished) return Promise.resolve(this.finished);
    this.available();
    if (this.busy) return Promise.reject(new DiaError(409, 'há um projeto sendo preparado; aguarde e tente novamente'));
    this.busy = 'finalizar';
    this.finishing = this.doFinalizar().finally(() => { this.busy = null; this.finishing = undefined; });
    return this.finishing;
  }
  private async doFinalizar(): Promise<RelatorioDia> {
    if (!this.saved) {
      const sessions = this.sessions();
      const workfolder = resolve(this.deps.workfolder ?? process.env.WORKFOLDER ?? resolve(homedir(), 'workfolder'));
      const unsafe = sessions.naoGerenciadas.filter((a) => {
        if (!this.deps.isReal(a.id)) return false;
        if (!a.cwd || !isAbsolute(a.cwd)) return true;
        const path = relative(workfolder, resolve(a.cwd));
        return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
      });
      if (unsafe.length) throw new DiaError(409, 'há sessões não gerenciadas no workfolder ou sem pasta confirmada; encerre-as manualmente antes de finalizar o dia');
      for (const session of sessions.sessoes) this.pendingStops.set(session.id, session);
      // Todos são iniciados antes de aguardar: um encerramento não impede tentar os demais.
      const ids = [...this.pendingStops.keys()];
      const results = await Promise.allSettled(ids.map(async (id) => { await this.deps.ptys.stopAndWait(id); this.pendingStops.delete(id); }));
      const errors = results.flatMap((result, index) => result.status === 'rejected' ? [`${this.pendingStops.get(ids[index])?.nome ?? ids[index]}: ${result.reason instanceof Error ? result.reason.message : 'falha ao confirmar saída'}`] : []);
      if (errors.length) throw new DiaError(502, 'não consegui encerrar todas as sessões e subprocessos; nenhum projeto foi salvo ou limpo. Encerre as sessões restantes e tente novamente. ' + scrubProjectError(errors.slice(0, 3).join('; '), process.env).slice(0, 800));
      this.saved = relatorio(await this.deps.runner(['exit', '--sem-perguntas', '--json']));
    }
    let path: string;
    try { path = await this.deps.persist(this.saved); }
    catch { throw new DiaError(500, 'os projetos foram processados, mas o relatório não pôde ser gravado; o Habblaud continua ligado. Confira espaço/permissões e tente novamente para salvar o relatório'); }
    return this.finished = { ...this.saved, relatorioPath: path, desligaEm: 5 };
  }
  /** Só o handler HTTP chama, depois de enviar a resposta; callbacks reais nunca rodam em testes. */
  scheduleShutdown(): void {
    if (!this.finished || this.scheduled) return;
    this.scheduled = true;
    const schedule = this.deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms).unref());
    schedule(() => { Promise.resolve().then(() => this.deps.shutdown()).catch(() => log.error('Falha ao desligar após finalizar dia; use brain down.')); }, 5000);
  }
}
