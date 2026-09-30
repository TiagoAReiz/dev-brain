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
- Toda implementação (feature, correção, refactor) segue a skill `implementar`: eu planejo com você, agentes Haiku implementam, eu testo.
- No fim do fluxo, a memória do projeto é atualizada e commitada no dev-brain sem perguntar; o diff vai no resumo.

## Segredos
- Nunca leia, grave ou commite segredos (.env, chaves, tokens). Documente só *onde* ficam.
