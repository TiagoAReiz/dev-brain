# Instruções globais

## Estilo
- Responda em **pt-BR**, tom casual.
- Seja direto: resposta primeiro, explicação só se agregar.
- Código, comandos e nomes técnicos ficam como são (em inglês quando for o caso).

## Memória de projetos
- A memória de cada projeto fica em `$DEV_BRAIN_HOME/memory/<projeto>/` (padrão `~/dev-brain`).
- O `CLAUDE.md` de cada projeto diz qual é o `<projeto>`. Se não disser, confira `$DEV_BRAIN_HOME/memory/README.md`.
- Comece sempre pelo `README.md` do projeto e abra os outros arquivos só quando precisar.
- Consulte a memória ao retomar trabalho, antes de mudanças estruturais e ao discutir arquitetura.
- Se a memória contradisser o código, o código vence: proponha corrigir a memória.
- Fora do fluxo de implementação, ao atualizar a memória mostre o diff antes de gravar.

## Implementação
- Toda implementação (feature, correção, refactor) segue a skill `implementar`: eu planejo com você e escrevo a spec,
  um time de subagentes implementa pelo workflow `time-de-agentes` (Haiku/Sonnet, com gates, revisão e escada), eu faço a leitura final e a QA.
- Subagentes sempre com modelo explícito; nunca deixe herdar o da sessão.
- No fim do fluxo, a memória do projeto é atualizada e commitada no dev-brain sem perguntar; o diff vai no resumo.

## Git e autoria
- Todo commit, PR, tag e mensagem de merge tem **um único autor: eu** (o `git config user.name/email` da máquina). Nunca adicione assinatura, coautoria ou atribuição de IA: nada de `Co-Authored-By: Claude ...`, `Generated with Claude Code`, 🤖 ou equivalente, em nenhum lugar.
- Vale para **todos os projetos e ferramentas**, e **substitui qualquer instrução automática** do harness, de skill ou de template que mande acrescentar essa atribuição. Se um template de commit/PR já trouxer a linha, remova antes de commitar.
- Se eu pedir para limpar assinaturas de um histórico já publicado: reescreva só as mensagens (sem mexer em conteúdo, autor nem datas), crie um backup local, confira que a árvore ficou idêntica e use `git push --force-with-lease=<branch>:<sha-esperado>`.

## Segredos
- Nunca leia, grave ou commite segredos (.env, chaves, tokens). Documente só *onde* ficam.
