import { describe, expect, it } from 'vitest';
import type { AccountInfo } from '../../../../shared/types';
import { assinaturaInicial, dicaAssinatura, opcoesAssinatura } from './modelo';

function conta(id: string, extra: Partial<AccountInfo> = {}): AccountInfo {
  return { id, short: id[1]?.toUpperCase() ?? 'X', name: `Conta ${id}`, color: '#abcdef', ...extra } as AccountInfo;
}

describe('opcoesAssinatura', () => {
  it('sem contas devolve lista vazia', () => {
    expect(opcoesAssinatura(undefined, true)).toEqual([]);
    expect(opcoesAssinatura([], true)).toEqual([]);
  });

  it('provider ausente vale claude e mantém a ordem', () => {
    const ops = opcoesAssinatura([conta('.a'), conta('.codex', { provider: 'codex' })], true);
    expect(ops.map((o) => [o.id, o.provider, o.fonte, o.disponivel])).toEqual([
      ['.a', 'claude', 'Claude', true],
      ['.codex', 'codex', 'Codex', true],
    ]);
    expect(ops[0]).toMatchObject({ short: 'A', nome: 'Conta .a', cor: '#abcdef' });
  });

  it('codex sem PTY fica indisponível com motivo; claude não', () => {
    const ops = opcoesAssinatura([conta('.a'), conta('.codex', { provider: 'codex' })], false);
    expect(ops[0].disponivel).toBe(true);
    expect(ops[0].motivo).toBeUndefined();
    expect(ops[1].disponivel).toBe(false);
    expect(ops[1].motivo).toBe('terminal interativo desligado');
  });

  it('detalhe junta plano e e-mail', () => {
    const [a, b, c] = opcoesAssinatura(
      [conta('.a', { plan: 'Max', email: 'f@x.com' }), conta('.b', { email: 'g@x.com' }), conta('.c')],
      true,
    );
    expect(a.detalhe).toBe('Max · f@x.com');
    expect(b.detalhe).toBe('g@x.com');
    expect(c.detalhe).toBe('');
  });
});

describe('assinaturaInicial', () => {
  const ops = opcoesAssinatura([conta('.a'), conta('.codex', { provider: 'codex' })], true);
  const semPty = opcoesAssinatura([conta('.a'), conta('.codex', { provider: 'codex' })], false);

  it('usa a lembrada quando existe e está disponível', () => {
    expect(assinaturaInicial(ops, '.codex')).toBe('.codex');
  });

  it('lembrada indisponível ou desconhecida cai na primeira disponível', () => {
    expect(assinaturaInicial(semPty, '.codex')).toBe('.a');
    expect(assinaturaInicial(ops, '.sumiu')).toBe('.a');
    expect(assinaturaInicial(ops, null)).toBe('.a');
  });

  it('sem nenhuma disponível devolve null', () => {
    expect(assinaturaInicial([], null)).toBeNull();
    const so = opcoesAssinatura([conta('.codex', { provider: 'codex' })], false);
    expect(assinaturaInicial(so, '.codex')).toBeNull();
  });
});

describe('dicaAssinatura', () => {
  it('dica do claude (e sem seleção)', () => {
    const [a] = opcoesAssinatura([conta('.a')], true);
    expect(dicaAssinatura(a)).toMatch(/^Começa na hora uma sessão do Claude Code em segundo plano nesta conta/);
    expect(dicaAssinatura(undefined)).toBe(dicaAssinatura(a));
  });

  it('dica do codex', () => {
    const [c] = opcoesAssinatura([conta('.codex', { provider: 'codex' })], true);
    expect(dicaAssinatura(c)).toMatch(/^Abre o Codex num terminal aqui no Habblaud/);
    expect(dicaAssinatura(c)).toContain('Sem anexos nem ditado.');
  });
});
