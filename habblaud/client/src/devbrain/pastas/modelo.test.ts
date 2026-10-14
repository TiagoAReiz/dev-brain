import { describe, expect, it } from 'vitest';
import { atalhos, migalhas, urlNavegar } from './modelo';

describe('migalhas', () => {
  it('caminho POSIX com raiz e cada nível', () => {
    expect(migalhas('/home/tiago/x')).toEqual([
      { nome: '/', caminho: '/' },
      { nome: 'home', caminho: '/home' },
      { nome: 'tiago', caminho: '/home/tiago' },
      { nome: 'x', caminho: '/home/tiago/x' },
    ]);
  });

  it('caminho Windows com unidade como raiz', () => {
    expect(migalhas('C:\\code\\win')).toEqual([
      { nome: 'C:', caminho: 'C:\\' },
      { nome: 'code', caminho: 'C:\\code' },
      { nome: 'win', caminho: 'C:\\code\\win' },
    ]);
  });

  it('raiz POSIX vira uma migalha só', () => {
    expect(migalhas('/')).toEqual([{ nome: '/', caminho: '/' }]);
  });

  it('raiz Windows vira uma migalha só', () => {
    expect(migalhas('C:\\')).toEqual([{ nome: 'C:', caminho: 'C:\\' }]);
  });

  it('barra final é ignorada', () => {
    expect(migalhas('/home/tiago/')).toEqual(migalhas('/home/tiago'));
    expect(migalhas('C:\\code\\')).toEqual(migalhas('C:\\code'));
  });
});

describe('atalhos', () => {
  it('home POSIX com workfolder dentro dela', () => {
    expect(atalhos('/home/tiago')).toEqual([
      { nome: 'Home', caminho: '/home/tiago' },
      { nome: 'workfolder', caminho: '/home/tiago/workfolder' },
    ]);
  });

  it('home Windows usa barra invertida', () => {
    expect(atalhos('C:\\Users\\tiago')).toEqual([
      { nome: 'Home', caminho: 'C:\\Users\\tiago' },
      { nome: 'workfolder', caminho: 'C:\\Users\\tiago\\workfolder' },
    ]);
  });
});

describe('urlNavegar', () => {
  it('sem caminho e sem ocultas não envia query', () => {
    expect(urlNavegar(undefined, false)).toBe('/api/spawn/browse');
    expect(urlNavegar('', false)).toBe('/api/spawn/browse');
  });

  it('sem caminho com ocultas envia só hidden=1', () => {
    expect(urlNavegar(undefined, true)).toBe('/api/spawn/browse?hidden=1');
  });

  it('caminho é codificado no query', () => {
    expect(urlNavegar('/home/tiago/meu projeto&x=1', false)).toBe(
      '/api/spawn/browse?path=%2Fhome%2Ftiago%2Fmeu%20projeto%26x%3D1',
    );
  });

  it('caminho Windows e ocultas juntos', () => {
    expect(urlNavegar('C:\\code', true)).toBe('/api/spawn/browse?path=C%3A%5Ccode&hidden=1');
  });
});
