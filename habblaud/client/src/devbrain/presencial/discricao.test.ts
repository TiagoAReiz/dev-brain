import { describe, expect, it } from 'vitest';
import { faviconPresencial, TITULO_NOTIFICACAO, textoDiscreto, tituloPresencial } from './discricao';

describe('tituloPresencial', () => {
  it('sem ninguém esperando, só o nome', () => {
    expect(tituloPresencial(0)).toBe('Agentes');
  });

  it('um esperando usa o singular', () => {
    expect(tituloPresencial(1)).toBe('(1) Agentes · precisa de você');
  });

  it('vários esperando usam o plural com a contagem', () => {
    expect(tituloPresencial(3)).toBe('(3) Agentes · precisam de você');
  });
});

describe('TITULO_NOTIFICACAO', () => {
  it('é o texto fixo da notificação', () => {
    expect(TITULO_NOTIFICACAO).toBe('Agentes: precisa de você');
  });
});

describe('textoDiscreto', () => {
  it('tira emoji simples', () => {
    expect(textoDiscreto('Pronto 🎉 terminei')).toBe('Pronto terminei');
  });

  it('tira emoji composto por ZWJ (família e profissão)', () => {
    expect(textoDiscreto('Time 👨‍👩‍👧 e dev 👩‍💻 ok')).toBe('Time e dev ok');
  });

  it('tira o U+FE0F que força o estilo emoji', () => {
    expect(textoDiscreto('Atenção ⚠️ agora')).toBe('Atenção agora');
  });

  it('junta espaços repetidos e apara as pontas', () => {
    expect(textoDiscreto('   um   🚀   dois  ')).toBe('um dois');
  });

  it('texto sem emoji fica igual', () => {
    expect(textoDiscreto('rodando testes')).toBe('rodando testes');
  });
});

describe('faviconPresencial', () => {
  it('começa com o prefixo de data URL de SVG', () => {
    expect(faviconPresencial().startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('o SVG embutido é 32x32 e cinza', () => {
    const svg = decodeURIComponent(faviconPresencial().slice('data:image/svg+xml,'.length));
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
    expect(svg).toContain('#6b7280');
  });
});
