// Item da barra de status: quantos agentes trabalham e quantos esperam por você.
import * as vscode from 'vscode';
import type { ResumoAgentes } from './modelo';

export function criarStatusBar(): { atualizar(resumo: ResumoAgentes | null): void; dispose(): void } {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  item.command = 'habblaud.abrirEscritorio';

  function atualizar(resumo: ResumoAgentes | null): void {
    if (!resumo) {
      item.text = '$(circle-slash) Habblaud';
      item.tooltip = 'Habblaud não está no ar. Clique para abrir o escritório.';
      item.backgroundColor = undefined;
    } else {
      item.text = `$(organization) ${resumo.trabalhando} trabalhando · ${resumo.esperando} esperando`;
      item.tooltip = `Habblaud: ${resumo.trabalhando} trabalhando, ${resumo.esperando} esperando por você (${resumo.total} agentes). Clique para abrir o escritório.`;
      item.backgroundColor =
        resumo.esperando > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    }
    item.show();
  }

  atualizar(null);
  return { atualizar, dispose: () => item.dispose() };
}
