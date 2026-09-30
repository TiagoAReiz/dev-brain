# dev-brain

Fonte única do meu workflow com IA: memória por projeto, skills, `CLAUDE.md` global e setup de máquina nova.
É só markdown, shell e git: sem RAG, banco de dados ou servidor.

Roda em **Linux, macOS e WSL**. No Windows, use dentro do WSL (o Git Bash não cria symlinks confiáveis).

## Estrutura

```
install-tools.sh      # instala ferramentas de dev no Ubuntu/WSL (apt + nvm + claude)
bootstrap.sh          # configura a máquina (symlinks + checagem de deps)
new-project.sh        # cria memória + CLAUDE.md de um projeto novo
bin/project           # CLI create/start/exit de projetos em ~/workfolder -> ~/.local/bin/project
global/CLAUDE.md      # instruções globais  -> ~/.claude/CLAUDE.md
global/skills/<nome>/ # uma pasta por skill -> ~/.claude/skills/<nome>
templates/            # modelos usados pelo new-project.sh
memory/README.md      # índice de projetos
memory/<projeto>/     # README, arquitetura, estado-atual, decisoes, roadmap, specs/
```

## Máquina nova

```bash
gh auth login                       # se ainda não estiver logado
gh repo clone TiagoAReiz/dev-brain ~/dev-brain
cd ~/dev-brain
./install-tools.sh                  # só Ubuntu/WSL; pede a senha do sudo
source ~/.bashrc
./bootstrap.sh
```

O `install-tools.sh` é idempotente e instala:
- **via apt:** git, gh (repo oficial), build-essential, curl, unzip, jq, shellcheck, fzf, python3 + pip + venv + pipx, OpenJDK 21 e 25 (padrão 25) e maven;
- **no seu usuário:** nvm + Node LTS (npm/npx), Nest CLI e Claude Code;
- **no `~/.bashrc`:** nvm, `~/.local/bin` e `DEV_BRAIN_HOME`.

Fases separadas: `sudo ./install-tools.sh system` e `./install-tools.sh user`.
Para trocar o Java padrão: `sudo update-alternatives --config java`.

O `bootstrap.sh` é idempotente e pode rodar quantas vezes quiser. Ele:
- cria symlinks de `global/CLAUDE.md` e de cada skill em `~/.claude/`, e de cada script de `bin/` em `~/.local/bin/`;
- se já houver outro arquivo no destino, move para `<arquivo>.bak.<data>` e avisa (nunca apaga);
- só **verifica** git, gh, node, python3, shellcheck e claude, sem instalar nada;
- no fim, imprime o que foi feito, o que foi pulado e o que precisa de ação manual.

Depois de adicionar uma skill em `global/skills/`, rode `./bootstrap.sh` de novo.

## Dia a dia: `project`

Fluxo de trabalho em `~/workfolder` (muda com `WORKFOLDER=...`): clona, trabalha, salva tudo e limpa.

```bash
project create meu-app [--public]   # repo novo (privado por padrão) + memória + CLAUDE.md, abre o Claude
project start                       # pull do dev-brain, escolhe um repo (fzf), clona, oferece criar a memória, abre o Claude
project exit                        # commita e dá push em tudo, oferece commitar a memória, limpa o workfolder
```

O `create` usa o `new-project.sh` por baixo: o nome do repo é o nome da memória, e o `CLAUDE.md` entra no commit inicial.

O `exit` só apaga uma pasta quando **tudo** está no GitHub. Mantém a pasta (e avisa) se:
- não é repo git, ou há repos git aninhados e você não quis removê-los;
- há `.env` ignorado e você não confirmou que pode apagar;
- o commit ou o push falhou, ou o HEAD está destacado;
- há commits em outras branches locais que não estão no remoto, ou há stash.

Se o push da branch atual falhar (ex.: divergiu), ele envia o HEAD para `wip/<data-hora>` sem trocar de branch.
Arquivos soltos no workfolder nunca são apagados. O Claude abre com `--dangerously-skip-permissions`.

## Projeto novo (repo que já existe)

```bash
~/dev-brain/new-project.sh meu-app ~/code/meu-app   # ou sem o caminho, dentro do repo do projeto
```

- cria `memory/meu-app/` a partir dos templates, com nome e data preenchidos;
- cria `~/code/meu-app/CLAUDE.md` apontando para `$DEV_BRAIN_HOME/memory/meu-app/`;
- adiciona o projeto ao `memory/README.md`;
- faz `git add` no dev-brain, **sem commit**;
- aborta sem alterar nada se a memória ou o `CLAUDE.md` já existirem.

Depois disso, preencha o `README.md` do projeto e a linha do índice, e faça o commit.

## Atualizando a memória

- O agente propõe atualizar `estado-atual.md` e `decisoes.md` no fim das sessões relevantes e mostra o diff antes de gravar.
- Revise e commite no dev-brain: `git -C ~/dev-brain add -A && git -C ~/dev-brain commit -m "memory(<projeto>): ..." && git -C ~/dev-brain push`
- Em outra máquina: `git -C ~/dev-brain pull`. Os symlinks já apontam para o repo, então não é preciso fazer mais nada.
- Se a memória contradisser o código, o código vence: corrija a memória.

## O que não é automatizado

Nenhum segredo entra neste repo (o `.gitignore` bloqueia `.env`, `*.key`, `*.pem`, `secrets*` etc.). Aqui fica só **onde** buscar cada credencial:

| O quê | Como / onde |
|---|---|
| GitHub | `gh auth login` (token fica no keyring do SO) |
| Claude Code | `claude`, depois login no navegador (conta Anthropic) |
| Chave SSH | gerar com `ssh-keygen -t ed25519` e cadastrar em github.com/settings/keys |
| git user.name/email | `git config --global user.name/user.email` |
| `.env` de cada projeto | no gerenciador de senhas / painel do provedor (Vercel, Supabase etc.); o `arquitetura.md` do projeto diz onde |
| `DEV_BRAIN_HOME` | exportar no `~/.bashrc`/`~/.zshrc` (padrão `~/dev-brain`) |
