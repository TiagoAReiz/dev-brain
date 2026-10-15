import { describe, expect, it } from 'vitest';
import type { PtyInfo } from '../../../../shared/types';
import { comandoSeletor, ptyVivo } from './atalho';

const pty = (id: string, agentId: string, extra: Partial<PtyInfo> = {}): PtyInfo =>
  ({ id, pid: 1, cwd: '/x', account: 'c', agentId, startedAt: 0, ...extra }) as PtyInfo;

describe('atalho de modelo/effort', () => {
  it('monta o comando com Enter no fim', () => {
    expect(comandoSeletor('model')).toBe('/model\r');
    expect(comandoSeletor('effort')).toBe('/effort\r');
  });

  it('acha só o terminal vivo do agente', () => {
    const lista = [pty('1', 'a', { exitedAt: 5 }), pty('2', 'a'), pty('3', 'b')];
    expect(ptyVivo(lista, 'a')?.id).toBe('2');
    expect(ptyVivo(lista, 'z')).toBeUndefined();
    expect(ptyVivo(undefined, 'a')).toBeUndefined();
  });
});
