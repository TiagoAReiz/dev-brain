import { describe, expect, it } from 'vitest';
import { dicaIndisponivel, ICONE_FINALIZAR, ICONE_INICIAR, ICONE_PRESENCIAL } from './botao';

describe('dicaIndisponivel', () => {
  it('sem motivo devolve só o rótulo', () => {
    expect(dicaIndisponivel('Iniciar dia', null)).toBe('Iniciar dia');
    expect(dicaIndisponivel('Iniciar dia', undefined)).toBe('Iniciar dia');
    expect(dicaIndisponivel('Iniciar dia', '')).toBe('Iniciar dia');
  });
  it('com motivo junta rótulo e motivo', () => {
    expect(dicaIndisponivel('Finalizar dia', 'dia já finalizado')).toBe('Finalizar dia: dia já finalizado');
  });
});

describe('ícones', () => {
  it('são SVGs em string com a classe do botão', () => {
    for (const i of [ICONE_INICIAR, ICONE_FINALIZAR, ICONE_PRESENCIAL]) {
      expect(typeof i).toBe('string');
      expect(i.startsWith('<svg')).toBe(true);
      expect(i).toContain('dbh-ico-svg');
    }
  });
});
