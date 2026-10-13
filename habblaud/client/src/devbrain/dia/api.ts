import type { PtyInfo } from '../../../../shared/types';

export interface Repo { repo: string; nome: string; temMemoria: boolean; local: boolean }
export interface Projeto { dir: string; memoria: string; novaMemoria: boolean; prompt: string | null }
export type Inicio = { repo: string } | { nome: string; visibilidade?: 'private' | 'public' };
export interface Resumo {
  repos: { nome: string; dir: string; pendente: number; commits: number; riscos: string[] }[];
  memoria: { mudancas: number; commits: number };
  avulsos: string[];
  sessoes: { id: string; nome: string; cwd: string }[];
  naoGerenciadas: { id: string; nome: string }[];
}
export interface Relatorio {
  salvos: string[];
  mantidos: { nome: string; motivo: string }[];
  memoria: { salva: boolean; motivo: string | null };
  relatorioPath: string;
  desligaEm: number;
}

async function request<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/devbrain/${path}`, {
      credentials: 'same-origin', cache: 'no-store',
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('O Habblaud não respondeu. Confira a conexão antes de tentar novamente.');
  }
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error ?? `O pedido falhou (${response.status}).`);
  if (data === null) throw new Error('O Habblaud enviou uma resposta inválida.');
  return data;
}

export const diaApi = {
  repos: () => request<Repo[]>('repos'),
  iniciar: (body: Inicio) => request<{ projeto: Projeto; pty: PtyInfo }>('iniciar', body),
  resumo: () => request<Resumo>('resumo'),
  finalizar: () => request<Relatorio>('finalizar', {}),
};
