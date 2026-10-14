// Ponte com a extensão do VS Code: quando o escritório roda embutido (iframe do webview), pede à extensão para abrir
// um caminho no editor. Fora do VS Code, o botão fica oculto.
import { tr } from '../../../../shared/i18n';
import { h } from '../../ui/dom';

/** Só o que o módulo usa de `window`; injetável para teste sem DOM. */
export interface JanelaPonte {
  parent: unknown;
  self?: unknown;
  location: { search: string };
}

const CHAVE = 'habblaud.vscode';

function lembrar(): void {
  try {
    sessionStorage.setItem(CHAVE, '1');
  } catch {
    // sem sessionStorage (modo privado, sandbox): segue sem lembrar
  }
}

function lembrado(): boolean {
  try {
    return sessionStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

function janelaPadrao(): JanelaPonte | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as JanelaPonte);
}

/** True se a página está dentro de um iframe e foi carregada com ?vscode=1 (ou já foi, nesta aba, antes de uma navegação interna). */
export function embutido(janela: JanelaPonte | undefined = janelaPadrao()): boolean {
  if (!janela) return false;
  if (janela.self === undefined || janela.parent === janela.self) return false;
  const comParametro = new URLSearchParams(janela.location.search).get('vscode') === '1';
  if (comParametro) lembrar();
  return comParametro || lembrado();
}

/** Pede à extensão para abrir `caminho` (e `linha`, se houver). Devolve false, sem postar nada, fora do VS Code. */
export function pedirAbrir(caminho: string, linha?: number, janela: JanelaPonte | undefined = janelaPadrao()): boolean {
  if (!janela || !embutido(janela)) return false;
  const pai = janela.parent as { postMessage(mensagem: unknown, alvo: string): void };
  // targetOrigin '*': a extensão confere a origin do remetente.
  pai.postMessage(linha === undefined ? { source: 'habblaud', type: 'abrir', path: caminho } : { source: 'habblaud', type: 'abrir', path: caminho, line: linha }, '*');
  return true;
}

/** Botão "Abrir no VS Code" para o caminho devolvido por `caminho()` no momento do clique. Oculto fora do VS Code. */
export function botaoAbrirNoVscode(caminho: () => string): HTMLButtonElement {
  const rotulo = tr('Abrir no VS Code');
  const b = h('button', {
    class: 'ui-btn ui-btn--sm',
    type: 'button',
    title: rotulo,
    attrs: { 'aria-label': rotulo },
    text: rotulo,
    on: { click: () => pedirAbrir(caminho()) },
  });
  b.hidden = !embutido();
  return b;
}
