# dev-brain

## Memória do projeto

A memória deste projeto fica em `memory/dev-brain/` (neste mesmo repo). Comece pelo `README.md` dela.
Implementações seguem a skill `implementar`; as specs ficam em `memory/dev-brain/specs/`.

## Específico deste projeto
<!-- Gates do time de agentes para mudanças no Habblaud (rodam dentro de habblaud/). {arquivos} = arquivos da tarefa. -->
gate-tarefa: npx vitest related {arquivos} --run --passWithNoTests && npm run -s typecheck
gate-onda: npm run -s typecheck && npx vitest run && npm run -s build

- Mudanças no Habblaud: código nosso em `habblaud/client/src/devbrain/`; nos arquivos do original, só ganchos pequenos.
- Mudanças no resto do dev-brain: `node --test 'tests/*.test.cjs' && for t in tests/*.test.sh; do bash "$t"; done`.
