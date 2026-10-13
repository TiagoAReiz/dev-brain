import { describe, expect, it, vi } from 'vitest';
import { OfficeStore } from '../net/store';
import { createWorld } from './index';

describe('pausa do mundo', () => {
  it('setPaused para e retoma o laço de quadros sem duplicar', () => {
    const fonts = new EventTarget();
    vi.stubGlobal('document', Object.assign(new EventTarget(), { fonts }));
    vi.stubGlobal('window', new EventTarget());
    let lastId = 0;
    const raf = vi.fn(() => ++lastId);
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', caf);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const canvas = Object.assign(new EventTarget(), {
      clientWidth: 800,
      clientHeight: 600,
      width: 800,
      height: 600,
      style: {},
      getContext: () => ({}),
    }) as unknown as HTMLCanvasElement;
    const store = new OfficeStore();
    const world = createWorld(canvas, store);
    try {
      expect(raf).toHaveBeenCalledTimes(1);
      const idInicial = lastId;

      world.setPaused?.(true);
      expect(caf).toHaveBeenCalledTimes(1);
      expect(caf).toHaveBeenLastCalledWith(idInicial);
      expect(raf).toHaveBeenCalledTimes(1);

      // repetir a pausa não cancela nem agenda de novo
      world.setPaused?.(true);
      expect(caf).toHaveBeenCalledTimes(1);
      expect(raf).toHaveBeenCalledTimes(1);

      world.setPaused?.(false);
      expect(raf).toHaveBeenCalledTimes(2);

      // repetir a retomada não duplica o laço
      world.setPaused?.(false);
      expect(raf).toHaveBeenCalledTimes(2);
      expect(caf).toHaveBeenCalledTimes(1);
    } finally {
      world.destroy();
      store.disconnect();
      vi.unstubAllGlobals();
    }
  });
});
