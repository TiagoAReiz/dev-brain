import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { lerPedido, type PedidoAbrir } from './ponte';

let painel: vscode.WebviewPanel | undefined;

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Literal JS seguro para ficar dentro de <script> (sem fechar a tag).
function literalJs(s: string): string {
  return JSON.stringify(s).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function montarHtml(url: string, nonce: string): string {
  let origem = '';
  try {
    const o = new URL(url).origin;
    if (o !== 'null') origem = o;
  } catch { /* URL inválida: o iframe nem é criado */ }
  const src = `${url.replace(/\/+$/, '')}/?vscode=1`;
  const csp = `default-src 'none'; frame-src ${origem || "'none'"}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'`;
  const iframe = origem ? `<iframe id="f" src="${escaparHtml(src)}"></iframe>` : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escaparHtml(csp)}">
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
  .erro { padding: 24px; font-family: var(--vscode-font-family); color: var(--vscode-errorForeground); }
</style>
</head>
<body>
${iframe}
<script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  var origem = ${literalJs(origem)};
  var url = ${literalJs(url)};
  var f = document.getElementById('f');
  var carregou = false;
  function erro() {
    document.body.textContent = '';
    var d = document.createElement('div');
    d.className = 'erro';
    d.textContent = 'não consegui carregar ' + url + '; o Habblaud está no ar?';
    document.body.appendChild(d);
  }
  if (!f) { erro(); return; }
  f.addEventListener('load', function () { carregou = true; });
  setTimeout(function () { if (!carregou) erro(); }, 8000);
  window.addEventListener('message', function (event) {
    if (event.origin !== origem) return;
    var d = event.data;
    if (d && d.source === 'habblaud' && d.type === 'abrir') vscode.postMessage(d);
  });
})();
</script>
</body>
</html>`;
}

/** Abre (ou reaproveita) o painel único do escritório. */
export function abrirEscritorio(ctx: vscode.ExtensionContext, url: () => string, aoPedirAbrir: (p: PedidoAbrir) => void): void {
  const atual = url();
  if (painel) {
    painel.reveal();
    return;
  }
  const p = vscode.window.createWebviewPanel('habblaud.escritorio', 'Habblaud', vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
  });
  painel = p;
  p.webview.html = montarHtml(atual, randomBytes(16).toString('base64'));
  p.webview.onDidReceiveMessage((dado: unknown) => {
    const pedido = lerPedido(dado);
    if (pedido) aoPedirAbrir(pedido);
  }, undefined, ctx.subscriptions);
  p.onDidDispose(() => { painel = undefined; }, undefined, ctx.subscriptions);
}
