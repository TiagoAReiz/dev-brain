# {{NOME}}

## Memória do projeto

A memória persistente deste projeto fica **fora do repo**, em:

`$DEV_BRAIN_HOME/memory/{{NOME}}/` (padrão: `~/dev-brain/memory/{{NOME}}/`)

### Como ler (sem inflar o contexto)
1. Leia **só** `README.md` primeiro. Ele resume o projeto e diz qual arquivo abrir para quê.
2. Abra os outros sob demanda:
   - `arquitetura.md`: infra, organização do código, onde fica cada coisa
   - `decisoes.md`: por que algo é como é e o que já foi descartado
   - `roadmap.md`: plano e próximos passos
   - `estado-atual.md`: o que está em andamento agora
   - `specs/`: specs detalhadas, uma por arquivo

### Quando consultar
- Ao **retomar trabalho** (início de sessão, depois de uma pausa): `README.md` + `estado-atual.md`
- **Antes de mudanças estruturais** (nova dependência, mudar pastas, trocar lib, mexer em infra): `arquitetura.md` + `decisoes.md`
- Ao **discutir decisões de arquitetura**: `decisoes.md`, para não repropor algo já descartado

### Quando atualizar
Ao final de uma sessão em que algo relevante mudou:
- `estado-atual.md`: atualize o conteúdo e o campo "Última atualização" (AAAA-MM-DD)
- `decisoes.md`: adicione uma entrada para cada decisão nova (decisão, motivo, alternativas descartadas)

**Mostre o diff e peça confirmação antes de gravar.** Não commite no dev-brain; o usuário faz isso.

### A memória pode estar desatualizada
Trate a memória como histórico, não como verdade. Se ela contradisser o código, **o código vence**: siga o código e proponha a correção na memória.

## Específico deste projeto
<!-- Comandos de build/test, convenções e armadilhas que só valem aqui. -->
