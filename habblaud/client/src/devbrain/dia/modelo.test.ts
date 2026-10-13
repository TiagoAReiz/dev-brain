import { describe, expect, it } from 'vitest';
import { filtrarRepos, motivoIndisponivel, validarNome } from './modelo';

const repos = [
  { nome: 'beta', repo: 'Tiago/beta', temMemoria: false, local: false },
  { nome: 'zeta', repo: 'Tiago/zeta', temMemoria: true, local: true },
  { nome: 'alfa', repo: 'Outro/alfa', temMemoria: true, local: false },
];
describe('lista de projetos', () => {
  it('busca nome/dono sem mudar a lista original e prioriza memórias', () => {
    expect(filtrarRepos(repos, ' TIAGO ').map((r) => r.nome)).toEqual(['zeta', 'beta']);
    expect(filtrarRepos(repos, '').map((r) => r.nome)).toEqual(['alfa', 'zeta', 'beta']);
    expect(repos[0].nome).toBe('beta');
    expect(filtrarRepos(repos, 'ausente')).toEqual([]);
  });
});
describe('criar projeto', () => {
  it.each(['meu-projeto', 'app2', '123'])('aceita %s', (nome) => expect(validarNome(nome)).toBeNull());
  it.each(['', 'App', '-app', 'app-', 'app--dois', '../app', 'a/b', 'a b', 'a'.repeat(101)])('recusa %s', (nome) => expect(validarNome(nome)).not.toBeNull());
});
describe('disponibilidade', () => {
  const local = { replay: false, remote: false, local: true, terminal: true };
  it('exige acesso local, terminal e tempo real', () => {
    expect(motivoIndisponivel(local)).toBe('');
    expect(motivoIndisponivel({ ...local, replay: true })).toContain('timelapse');
    expect(motivoIndisponivel({ ...local, remote: true })).toContain('computador');
    expect(motivoIndisponivel({ ...local, local: false })).toContain('computador');
    expect(motivoIndisponivel({ ...local, terminal: false, reason: 'Desligado' })).toBe('Desligado');
  });
});
