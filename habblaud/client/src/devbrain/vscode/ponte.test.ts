import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { embutido, pedirAbrir, type JanelaPonte } from './ponte';

// Ambiente node: sem DOM. A janela é falsa; sessionStorage é simulado.
const guardado = new Map<string, string>();
const armazenamento = {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
};

function janela(search: string, dentroDeIframe: boolean, pai: unknown = { postMessage: vi.fn() }): JanelaPonte & { parent: { postMessage: ReturnType<typeof vi.fn> } } {
  const self = {};
  return { self, parent: dentroDeIframe ? pai : self, location: { search } } as JanelaPonte & { parent: { postMessage: ReturnType<typeof vi.fn> } };
}

beforeEach(() => {
  guardado.clear();
  vi.stubGlobal('sessionStorage', armazenamento);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('embutido', () => {
  it('só com iframe e ?vscode=1', () => {
    expect(embutido(janela('?vscode=1', true))).toBe(true);
  });

  it('fora de iframe é falso, mesmo com ?vscode=1', () => {
    expect(embutido(janela('?vscode=1', false))).toBe(false);
  });

  it('dentro de iframe sem o parâmetro é falso', () => {
    expect(embutido(janela('', true))).toBe(false);
    expect(embutido(janela('?vscode=0', true))).toBe(false);
  });

  it('sem janela (ambiente sem DOM) é falso', () => {
    expect(embutido(undefined)).toBe(false);
  });

  it('lembra em sessionStorage e continua embutido após navegação sem o parâmetro', () => {
    expect(embutido(janela('?vscode=1', true))).toBe(true);
    expect(guardado.get('habblaud.vscode')).toBe('1');
    expect(embutido(janela('/sala/3', true))).toBe(true);
  });

  it('o lembrete não vale fora de iframe', () => {
    guardado.set('habblaud.vscode', '1');
    expect(embutido(janela('', false))).toBe(false);
  });

  it('sem sessionStorage funciona só pelo parâmetro', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('negado');
      },
      setItem: () => {
        throw new Error('negado');
      },
    });
    expect(embutido(janela('?vscode=1', true))).toBe(true);
    expect(embutido(janela('', true))).toBe(false);
  });
});

describe('pedirAbrir', () => {
  it('posta a mensagem exata no pai com targetOrigin "*"', () => {
    const j = janela('?vscode=1', true);
    expect(pedirAbrir('/home/tiago/dev-brain', undefined, j)).toBe(true);
    expect(j.parent.postMessage).toHaveBeenCalledWith({ source: 'habblaud', type: 'abrir', path: '/home/tiago/dev-brain' }, '*');
  });

  it('inclui a linha quando informada', () => {
    const j = janela('?vscode=1', true);
    expect(pedirAbrir('/home/tiago/x.ts', 12, j)).toBe(true);
    expect(j.parent.postMessage).toHaveBeenCalledWith({ source: 'habblaud', type: 'abrir', path: '/home/tiago/x.ts', line: 12 }, '*');
  });

  it('fora do VS Code (iframe sem ?vscode=1) devolve false e não posta', () => {
    const pai = { postMessage: vi.fn() };
    const j: JanelaPonte = { self: {}, parent: pai, location: { search: '' } };
    expect(pedirAbrir('/home/tiago/dev-brain', undefined, j)).toBe(false);
    expect(pai.postMessage).not.toHaveBeenCalled();
  });

  it('sem janela devolve false', () => {
    expect(pedirAbrir('/home/tiago/dev-brain', undefined, undefined)).toBe(false);
  });
});
