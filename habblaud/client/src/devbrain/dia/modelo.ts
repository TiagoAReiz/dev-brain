import type { Repo } from './api';

export function filtrarRepos(repos: readonly Repo[], busca: string): Repo[] {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  return repos.filter((r) => `${r.nome}\n${r.repo}`.toLocaleLowerCase('pt-BR').includes(termo))
    .sort((a, b) => Number(b.temMemoria) - Number(a.temMemoria) || a.nome.localeCompare(b.nome));
}

export function validarNome(nome: string): string | null {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(nome) && nome.length <= 100
    ? null : 'Use até 100 letras minúsculas, números e hífens entre palavras.';
}

export function motivoIndisponivel(input: { replay: boolean; remote: boolean; local: boolean; terminal: boolean; reason?: string }): string {
  if (input.replay) return 'Indisponível no timelapse';
  if (input.remote || !input.local) return 'Disponível somente neste computador';
  if (!input.terminal) return input.reason || 'Terminal interativo desligado';
  return '';
}
