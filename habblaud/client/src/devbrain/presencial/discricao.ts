/** Textos discretos do modo presencial: sem emoji, sem jeito de jogo. */

export const TITULO_NOTIFICACAO = 'Agentes: precisa de você';

/** Título da aba: conta os agentes esperando por você. */
export function tituloPresencial(esperando: number): string {
  if (esperando <= 0) return 'Agentes';
  if (esperando === 1) return '(1) Agentes · precisa de você';
  return `(${esperando}) Agentes · precisam de você`;
}

/** Tira emoji (e os caracteres que os compõem), junta espaços e apara as pontas. */
export function textoDiscreto(texto: string): string {
  return texto
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="6" fill="#6b7280"/></svg>';

/** Favicon neutro para o modo presencial: quadrado arredondado cinza, sem texto. */
export function faviconPresencial(): string {
  return 'data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG);
}
