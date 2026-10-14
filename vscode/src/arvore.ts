// Árvore da barra lateral: salas → agentes → arquivos mexidos.
import * as vscode from 'vscode';
import { arvore, type ArquivoMexido, type NoAgente, type NoSala } from './modelo';

export type No =
  | { tipo: 'sala'; sala: NoSala }
  | { tipo: 'agente'; sala: NoSala; agente: NoAgente }
  | { tipo: 'arquivo'; sala: NoSala; agente: NoAgente; arquivo: ArquivoMexido };

/** Ícone por estado (AgentStatus do Habblaud). */
function iconeDoEstado(estado: string): vscode.ThemeIcon {
  switch (estado) {
    case 'working':
      return new vscode.ThemeIcon('sync~spin');
    case 'waiting':
      return new vscode.ThemeIcon('bell', new vscode.ThemeColor('charts.yellow'));
    case 'idle':
      return new vscode.ThemeIcon('circle-outline');
    case 'done':
      return new vscode.ThemeIcon('check');
    case 'shell':
      return new vscode.ThemeIcon('terminal');
    case 'offline':
      return new vscode.ThemeIcon('circle-slash');
    default:
      return new vscode.ThemeIcon('question');
  }
}

function basename(caminho: string): string {
  const partes = caminho.split(/[\\/]/).filter(Boolean);
  return partes[partes.length - 1] ?? caminho;
}

/** Pasta do arquivo relativa à sala; vazio se não der (fora da sala ou direto na raiz). */
function pastaRelativa(caminho: string, sala: string): string {
  const base = sala.replace(/[\\/]+$/, '');
  if (!base || !caminho.startsWith(base + '/')) return '';
  const resto = caminho.slice(base.length + 1).split('/');
  resto.pop();
  return resto.join('/');
}

export class ArvoreAgentes implements vscode.TreeDataProvider<No> {
  private salas: NoSala[] = [];
  private readonly emitter = new vscode.EventEmitter<No | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  /** Recalcula a árvore a partir de um snapshot e avisa o VS Code. */
  atualizar(snapshot: unknown): void {
    this.salas = arvore(snapshot);
    this.emitter.fire();
  }

  /** Caminhos das salas atuais (a extensão usa para validar pedidos). */
  caminhosDasSalas(): string[] {
    return this.salas.map((s) => s.caminho);
  }

  getChildren(no?: No): No[] {
    if (!no) return this.salas.map((sala) => ({ tipo: 'sala', sala }));
    if (no.tipo === 'sala') return no.sala.agentes.map((agente) => ({ tipo: 'agente', sala: no.sala, agente }));
    if (no.tipo === 'agente') {
      return no.agente.arquivos.map((arquivo) => ({ tipo: 'arquivo', sala: no.sala, agente: no.agente, arquivo }));
    }
    return [];
  }

  getTreeItem(no: No): vscode.TreeItem {
    if (no.tipo === 'sala') {
      const item = new vscode.TreeItem(no.sala.nome, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `sala:${no.sala.id}`;
      item.description = no.sala.caminho;
      item.iconPath = new vscode.ThemeIcon('folder');
      item.tooltip = no.sala.caminho;
      item.contextValue = 'sala';
      return item;
    }

    if (no.tipo === 'agente') {
      const a = no.agente;
      const item = new vscode.TreeItem(a.nome, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `agente:${no.sala.id}:${a.id}`;
      const partes: string[] = [];
      if (a.sub) partes.push('sub');
      if (a.papel) partes.push(a.papel);
      if (a.esperandoPor) partes.push(`esperando: ${a.esperandoPor}`);
      item.description = partes.join(' · ');
      item.iconPath = iconeDoEstado(a.estado);
      const tip = new vscode.MarkdownString();
      tip.appendText([a.titulo ?? a.nome, `Papel: ${a.papel || '-'}`, `Estado: ${a.estado || '-'}`].join('\n'));
      if (a.esperandoPor) tip.appendText(`\nEsperando por: ${a.esperandoPor}`);
      if (a.sub) tip.appendText('\nSubagente');
      item.tooltip = tip;
      item.contextValue = 'agente';
      return item;
    }

    const { arquivo } = no;
    const item = new vscode.TreeItem(basename(arquivo.caminho), vscode.TreeItemCollapsibleState.None);
    item.id = `arquivo:${no.sala.id}:${no.agente.id}:${arquivo.caminho}`;
    item.description = pastaRelativa(arquivo.caminho, no.sala.caminho);
    item.iconPath = new vscode.ThemeIcon(arquivo.tipo === 'edit' ? 'edit' : 'eye');
    item.tooltip = `${arquivo.tipo === 'edit' ? 'Editado' : 'Lido'}: ${arquivo.caminho}`;
    item.command = { command: 'habblaud.abrirArquivo', title: 'Abrir arquivo', arguments: [arquivo.caminho] };
    item.contextValue = 'arquivo';
    return item;
  }
}
