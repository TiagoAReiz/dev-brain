import { describe, it, expect } from 'vitest';
import { lerPedido, caminhoPermitido, origemConfere } from './ponte';

describe('lerPedido', () => {
  it('aceita o formato exato, com e sem line', () => {
    expect(lerPedido({ source: 'habblaud', type: 'abrir', path: '/a/b' })).toEqual({ source: 'habblaud', type: 'abrir', path: '/a/b' });
    expect(lerPedido({ source: 'habblaud', type: 'abrir', path: '/a/b', line: 3 })?.line).toBe(3);
  });
  it('rejeita formatos inválidos', () => {
    for (const x of [null, undefined, 'x', 3, [], {}, { source: 'outro', type: 'abrir', path: '/a' },
      { source: 'habblaud', type: 'fechar', path: '/a' }, { source: 'habblaud', type: 'abrir' },
      { source: 'habblaud', type: 'abrir', path: 7 }, { source: 'habblaud', type: 'abrir', path: '' },
      { source: 'habblaud', type: 'abrir', path: '/a', line: 0 },
      { source: 'habblaud', type: 'abrir', path: '/a', line: 1.5 },
      { source: 'habblaud', type: 'abrir', path: '/a', line: '2' }]) {
      expect(lerPedido(x)).toBeNull();
    }
  });
});

describe('caminhoPermitido', () => {
  const pastas = ['/home/tiago/app'];
  it('permite a própria pasta e o que está dentro', () => {
    expect(caminhoPermitido('/home/tiago/app', pastas)).toBe(true);
    expect(caminhoPermitido('/home/tiago/app/src/a.ts', pastas)).toBe(true);
  });
  it('não confunde prefixo textual', () => {
    expect(caminhoPermitido('/home/tiago/app-secreto/x', pastas)).toBe(false);
    expect(caminhoPermitido('/home/tiago', pastas)).toBe(false);
  });
  it('rejeita relativo e `..`', () => {
    expect(caminhoPermitido('home/tiago/app/a', pastas)).toBe(false);
    expect(caminhoPermitido('/home/tiago/app/../outro', pastas)).toBe(false);
    expect(caminhoPermitido('/home/tiago/app/..', pastas)).toBe(false);
  });
  it('trata barras duplicadas e final', () => {
    expect(caminhoPermitido('/home//tiago/app//a/', pastas)).toBe(true);
    expect(caminhoPermitido('/home/tiago/app/a', ['/home/tiago/app/'])).toBe(true);
  });
  it('sem pastas válidas, nega', () => {
    expect(caminhoPermitido('/a', [])).toBe(false);
    expect(caminhoPermitido('/a', ['a'])).toBe(false);
  });
});

describe('origemConfere', () => {
  it('compara a origin da URL', () => {
    expect(origemConfere('http://localhost:4747', 'http://localhost:4747/qualquer?x=1')).toBe(true);
  });
  it('rejeita origem diferente (porta, host, esquema)', () => {
    expect(origemConfere('http://localhost:4748', 'http://localhost:4747')).toBe(false);
    expect(origemConfere('http://evil.com', 'http://localhost:4747')).toBe(false);
    expect(origemConfere('https://localhost:4747', 'http://localhost:4747')).toBe(false);
  });
  it('URL inválida => false', () => {
    expect(origemConfere('http://localhost:4747', 'não é url')).toBe(false);
    expect(origemConfere('null', 'data:text/plain,x')).toBe(false);
  });
});
