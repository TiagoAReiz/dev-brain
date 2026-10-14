// Ponte página -> extensão: validação pura dos pedidos (sem 'vscode').

export interface PedidoAbrir { source: 'habblaud'; type: 'abrir'; path: string; line?: number }

/** Lê o pedido no formato exato; qualquer outra coisa vira null. */
export function lerPedido(dado: unknown): PedidoAbrir | null {
  if (typeof dado !== 'object' || dado === null || Array.isArray(dado)) return null;
  const d = dado as Record<string, unknown>;
  if (d.source !== 'habblaud' || d.type !== 'abrir') return null;
  if (typeof d.path !== 'string' || d.path === '') return null;
  const pedido: PedidoAbrir = { source: 'habblaud', type: 'abrir', path: d.path };
  if (d.line !== undefined) {
    if (typeof d.line !== 'number' || !Number.isInteger(d.line) || d.line < 1) return null;
    pedido.line = d.line;
  }
  return pedido;
}

// Segmentos de um caminho absoluto; null se for relativo ou tiver `..`.
function segmentos(caminho: string): string[] | null {
  if (typeof caminho !== 'string' || !caminho.startsWith('/')) return null;
  const partes = caminho.split('/').filter((s) => s !== '' && s !== '.');
  if (partes.includes('..')) return null;
  return partes;
}

/** Caminho absoluto, sem `..`, igual a uma pasta ou dentro dela (por segmentos). */
export function caminhoPermitido(caminho: string, pastas: string[]): boolean {
  const alvo = segmentos(caminho);
  if (!alvo) return false;
  return pastas.some((pasta) => {
    const base = segmentos(pasta);
    return base !== null && base.length <= alvo.length && base.every((s, i) => s === alvo[i]);
  });
}

/** A origin do evento precisa ser a da URL configurada. */
export function origemConfere(origem: string, url: string): boolean {
  try {
    const esperada = new URL(url).origin;
    return esperada !== 'null' && origem === esperada;
  } catch {
    return false;
  }
}
