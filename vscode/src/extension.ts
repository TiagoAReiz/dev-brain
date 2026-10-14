// Liga cliente, árvore, barra de status, comandos e webview.
import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';
import { ClienteHabblaud } from './cliente';
import { resumo } from './modelo';
import { caminhoPermitido, type PedidoAbrir } from './ponte';
import { ArvoreAgentes, type No } from './arvore';
import { criarStatusBar } from './statusbar';
import { abrirEscritorio } from './webview';

let assinatura: { parar(): void } | undefined;

const urlConfigurada = (): string =>
  vscode.workspace.getConfiguration('habblaud').get<string>('url') ?? 'http://localhost:4747';

function pastasDoWorkspace(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((p) => p.uri.fsPath);
}

export function activate(ctx: vscode.ExtensionContext): void {
  const cliente = new ClienteHabblaud({ url: urlConfigurada });
  const arvore = new ArvoreAgentes();
  const barra = criarStatusBar();
  let online = false;

  ctx.subscriptions.push(barra, vscode.window.createTreeView('habblaud.agentes', { treeDataProvider: arvore }));

  const abrirArquivo = async (caminho: string, linha?: number): Promise<void> => {
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(caminho));
      const opts: vscode.TextDocumentShowOptions = {};
      if (linha !== undefined && linha >= 1) {
        const pos = new vscode.Position(linha - 1, 0);
        opts.selection = new vscode.Range(pos, pos);
      }
      await vscode.window.showTextDocument(doc, opts);
    } catch {
      void vscode.window.showWarningMessage(`Habblaud: não consegui abrir ${caminho} (o arquivo existe?).`);
    }
  };

  const abrirPasta = async (caminho: string): Promise<void> => {
    const uri = vscode.Uri.file(caminho);
    const folders = vscode.workspace.workspaceFolders ?? [];
    const dentro = folders.some((f) => caminhoPermitido(caminho, [f.uri.fsPath]));
    if (dentro) {
      await vscode.commands.executeCommand('revealInExplorer', uri);
      return;
    }
    const noWorkspace = 'Adicionar ao workspace';
    const novaJanela = 'Abrir em nova janela';
    const escolha = await vscode.window.showQuickPick([noWorkspace, novaJanela], {
      placeHolder: `Abrir ${caminho}`,
    });
    if (escolha === noWorkspace) {
      vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri });
    } else if (escolha === novaJanela) {
      await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
    }
  };

  const aoPedirAbrir = async (p: PedidoAbrir): Promise<void> => {
    const permitidos = [...arvore.caminhosDasSalas(), ...pastasDoWorkspace()];
    if (!caminhoPermitido(p.path, permitidos)) {
      void vscode.window.showWarningMessage('Habblaud: caminho fora das salas e do workspace foi recusado.');
      return;
    }
    try {
      const st = await fs.stat(p.path);
      if (st.isDirectory()) await abrirPasta(p.path);
      else await abrirArquivo(p.path, p.line);
    } catch {
      void vscode.window.showWarningMessage(`Habblaud: ${p.path} não existe.`);
    }
  };

  const novoAgenteAqui = async (): Promise<void> => {
    if (!online) {
      void vscode.window.showErrorMessage('Habblaud não está no ar: não dá para criar o agente agora.');
      return;
    }
    const pastas = pastasDoWorkspace();
    if (pastas.length === 0) {
      void vscode.window.showErrorMessage('Habblaud: abra uma pasta no VS Code para criar um agente nela.');
      return;
    }
    let pasta: string | undefined = pastas[0];
    if (pastas.length > 1) {
      const ativo = vscode.window.activeTextEditor?.document.uri;
      const doAtivo = ativo ? vscode.workspace.getWorkspaceFolder(ativo)?.uri.fsPath : undefined;
      pasta = doAtivo ?? (await vscode.window.showQuickPick(pastas, { placeHolder: 'Pasta do novo agente' }));
    }
    if (!pasta) return;
    const pedido = await vscode.window.showInputBox({
      prompt: `Pedido para o novo agente em ${pasta}`,
      ignoreFocusOut: true,
    });
    if (!pedido || !pedido.trim()) return;
    const r = await cliente.novoAgente(pasta, pedido);
    if (r.ok) void vscode.window.showInformationMessage(`Habblaud: agente criado em ${pasta}.`);
    else void vscode.window.showErrorMessage(`Habblaud: não consegui criar o agente (${r.erro ?? 'erro desconhecido'}).`);
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand('habblaud.abrirEscritorio', () => abrirEscritorio(ctx, urlConfigurada, (p) => void aoPedirAbrir(p))),
    vscode.commands.registerCommand('habblaud.atualizar', async () => {
      try {
        const s = await cliente.snapshot();
        online = true;
        arvore.atualizar(s);
        barra.atualizar(resumo(s));
      } catch {
        online = false;
        arvore.atualizar(null);
        barra.atualizar(null);
        void vscode.window.showWarningMessage('Habblaud: não está no ar.');
      }
    }),
    vscode.commands.registerCommand('habblaud.abrirPastaDaSala', async (no?: No) => {
      if (no?.tipo === 'sala') await abrirPasta(no.sala.caminho);
    }),
    vscode.commands.registerCommand('habblaud.novoAgenteAqui', novoAgenteAqui),
    vscode.commands.registerCommand('habblaud.abrirArquivo', (caminho: string, linha?: number) => abrirArquivo(caminho, linha)),
  );

  assinatura = cliente.assinar(
    (s) => {
      online = true;
      arvore.atualizar(s);
      barra.atualizar(resumo(s));
    },
    (on) => {
      online = on;
      if (!on) {
        arvore.atualizar(null); // árvore vazia: a viewsWelcome ("não está no ar") aparece
        barra.atualizar(null);
      }
    },
  );
  ctx.subscriptions.push({ dispose: () => deactivate() });
}

export function deactivate(): void {
  assinatura?.parar();
  assinatura = undefined;
}
