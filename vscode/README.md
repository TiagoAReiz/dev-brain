# Habblaud para VS Code

Extensão que traz o [Habblaud](../habblaud/) para dentro do VS Code, sem trocar de janela. Roda no lado WSL (Remote-WSL), onde o Habblaud e os caminhos Linux (`/home/tiago/...`) valem direto.

## O que ela faz

- **Escritório como aba do editor:** "Habblaud: abrir escritório" abre a página do Habblaud numa aba (webview). Dá para arrastar a aba como qualquer outra.
- **Barra lateral "Habblaud" → Agentes:** lista as salas e, dentro de cada uma, os agentes com ícone de estado. Cada agente mostra os arquivos que leu ou editou recentemente; clicar num arquivo abre no editor, na linha certa quando houver.
  É a lista dos **recentes** (as últimas atividades do agente), não um histórico completo.
- **Barra de status:** `N trabalhando · M esperando`. Fica com fundo de aviso quando algum agente espera por você. Clicar abre o escritório. Offline, mostra `Habblaud` com ícone de desligado.
- **"Abrir no VS Code" dentro do escritório:** na ficha da sala, o botão pede à extensão para abrir a pasta da sala. Fora do VS Code (no navegador) o botão não aparece.

A extensão atualiza sozinha: um agente novo aparece em alguns segundos, sem recarregar a janela.

## Requisitos

- VS Code rodando via **Remote-WSL** (a extensão é do lado `workspace`, então precisa estar conectada ao WSL).
- **Habblaud no ar** na URL configurada em `habblaud.url` (padrão `http://localhost:4747`).
- **Servidor do Habblaud atualizado e reiniciado**, porque ele passou a liberar o frame para o VS Code:

  ```bash
  systemctl --user restart habblaud
  ```

## Build e empacotamento

```bash
cd vscode
npm install
npm run empacotar      # gera habblaud-vscode.vsix nesta pasta
```

`npm run build` gera só `dist/extension.js`. `npm test` roda os testes unitários (módulos puros, sem VS Code nem Habblaud reais).

## Instalação

Num terminal do VS Code conectado ao WSL, a partir da raiz do dev-brain:

```bash
code --install-extension vscode/habblaud-vscode.vsix
```

Depois, `Ctrl+Shift+P` → **Developer: Reload Window**.

Para trocar a URL do servidor: configurações → `habblaud.url`.

## Comandos

| Comando | O que faz |
|---|---|
| Habblaud: abrir escritório (`habblaud.abrirEscritorio`) | Abre (ou reaproveita) a aba do escritório. Também é o link do aviso offline e do clique na barra de status. |
| Habblaud: atualizar (`habblaud.atualizar`) | Busca o estado de novo agora, sem esperar o stream. |
| Habblaud: abrir pasta da sala (`habblaud.abrirPastaDaSala`) | Item de contexto de uma sala na barra lateral. Se a pasta já está no workspace, só a revela no explorer; senão pergunta se quer adicionar ao workspace ou abrir em nova janela. |
| Habblaud: novo agente nesta pasta (`habblaud.novoAgenteAqui`) | Cria um agente na pasta do workspace ativo (pergunta a pasta se houver mais de uma), pede o texto do pedido e mostra o resultado. Precisa do Habblaud no ar. |
| Habblaud: abrir arquivo (`habblaud.abrirArquivo`) | Interno: é o que o clique num arquivo da árvore chama. Não aparece na paleta de comandos. |

## Como o "Abrir no VS Code" é validado

O escritório manda o pedido por `postMessage` e a extensão só age se:
- a mensagem veio da origem configurada em `habblaud.url`;
- o caminho é absoluto, não tem `..` e fica **dentro de uma sala do Habblaud ou de uma pasta do workspace** (comparação por pasta, não por prefixo de texto: `/home/tiago/app` não libera `/home/tiago/app-secreto`).

Caminho fora disso é recusado com um aviso discreto e nada abre.

## QA manual

O VS Code desktop não roda em automação aqui, então a verificação final é este roteiro, depois do `.vsix` instalado (Remote-WSL, Habblaud reiniciado):

1. A barra lateral "Habblaud" aparece e lista as salas e os agentes de agora, com ícone de estado. Um agente novo aparece em até alguns segundos, sem recarregar.
2. Clicar num arquivo de um agente abre no editor. A barra de status mostra `N trabalhando · M esperando` e clicar abre o escritório.
3. "Habblaud: abrir escritório" abre a aba com o escritório funcionando (canvas, clique em agente, "Novo agente").
4. Dentro da aba, ficha da sala → "Abrir no VS Code" abre a pasta ou a revela no explorer. Fora do VS Code (`http://localhost:4747` no navegador) o botão não aparece.
5. "Habblaud: novo agente nesta pasta" cria um agente na pasta aberta e ele aparece na árvore.
6. Com o Habblaud parado, a árvore mostra o aviso "não está no ar" e a barra de status vira offline. Ao subir, volta sozinha.

**Teste negativo de segurança:** uma página em outra porta (`http://localhost:<outra porta>`) com `<iframe src="http://localhost:4747">` precisa continuar **bloqueada**. O `frame-ancestors` do servidor não libera `http`, só `vscode-webview:` e `vscode-file:`.

## Se o escritório ficar em branco

O servidor do Habblaud manda `Content-Security-Policy: frame-ancestors 'self' vscode-webview: vscode-file:` nas páginas estáticas do modo local. O `vscode-file:` existe porque, no VS Code desktop, o webview fica dentro do workbench (`vscode-file://...`), e a cadeia de ancestrais inteira precisa ser liberada.

Se ainda assim o escritório ficar em branco:
1. confira se o Habblaud foi reiniciado (`systemctl --user restart habblaud`) e se `habblaud.url` aponta para ele;
2. se continuar em branco, o próximo passo é um **proxy local na própria extensão** (a página servida pela extensão, não pelo servidor do Habblaud). Abra uma issue ou peça ao agente para implementar.

O aviso de "não consegui carregar" aparece após 8 s, mas ele não cobre esse caso: o evento `load` do iframe dispara mesmo quando o navegador bloqueia o conteúdo.
