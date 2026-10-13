# dev-brain

Fonte única do meu workflow com IA: memória por projeto, skills, `CLAUDE.md` global e setup de máquina nova.
É só markdown, shell e git: sem RAG, banco de dados ou servidor.

Roda em **Linux, macOS e WSL**. No Windows, use dentro do WSL (o Git Bash não cria symlinks confiáveis).

## Estrutura

```
install-tools.sh      # instala ferramentas de dev no Ubuntu/WSL (apt + nvm + claude) e configura bash/fish
bootstrap.sh          # configura a máquina (symlinks + checagem de deps)
new-project.sh        # cria memória + CLAUDE.md de um projeto novo
bin/project           # CLI create/start/exit de projetos em ~/workfolder -> ~/.local/bin/project
bin/spec-check        # valida as tarefas de uma spec e calcula as ondas -> ~/.local/bin/spec-check
lib/                  # código Node usado pelos bins (sem dependências)
global/CLAUDE.md      # instruções globais  -> ~/.claude/CLAUDE.md
global/skills/<nome>/ # uma pasta por skill -> ~/.claude/skills/<nome>
global/agents/<nome>.md # subagentes do time -> ~/.claude/agents/<nome>.md
global/workflows/     # scripts de Workflow (time.js: o time de agentes)
templates/            # modelos usados pelo new-project.sh
memory/README.md      # índice de projetos
memory/<projeto>/     # README, arquitetura, estado-atual, decisoes, roadmap, specs/
docs/                 # specs e planos do próprio dev-brain
exemplos/sandbox/     # repo de teste do time de agentes
tests/                # node --test 'tests/*.test.cjs' && bash tests/*.test.sh
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
- **no `~/.bashrc`:** nvm, `~/.local/bin`, `DEV_BRAIN_HOME` e `alias claude='claude --dangerously-skip-permissions'` (para abrir sem o bypass: `command claude`).

Fases separadas: `sudo ./install-tools.sh system` e `./install-tools.sh user`.
Para trocar o Java padrão: `sudo update-alternatives --config java`.
Só a configuração do shell (máquina que já tem as ferramentas): `./install-tools.sh shell`.
Se houver **fish**, ela grava `~/.config/fish/conf.d/dev-brain.fish` com `DEV_BRAIN_HOME`, `~/.local/bin` no PATH e o alias do claude.

O `bootstrap.sh` é idempotente e pode rodar quantas vezes quiser. Ele:
- cria symlinks de `global/CLAUDE.md`, de cada skill e de cada subagente (`global/agents/`) em `~/.claude/`, e de cada script de `bin/` em `~/.local/bin/`;
- cria `~/.claude/CLAUDE.maquina.md` (uma vez só) para instruções que valem só naquela máquina; o `global/CLAUDE.md` importa esse arquivo;
- se já houver outro arquivo no destino, move para `<arquivo>.bak.<data>` e avisa (nunca apaga);
- só **verifica** git, gh, node, python3, shellcheck e claude, sem instalar nada;
- no fim, imprime o que foi feito, o que foi pulado e o que precisa de ação manual.

Depois de adicionar uma skill em `global/skills/`, rode `./bootstrap.sh` de novo.

## Dia a dia: `project`

Fluxo de trabalho em `~/workfolder` (muda com `WORKFOLDER=...`): clona, trabalha, salva tudo e limpa.

```bash
project create [nome] [--public]    # pergunta o que faltar; repo novo + memória + CLAUDE.md, abre o Claude no kickoff
project start                       # pull do dev-brain, escolhe um repo (fzf), clona, mostra o estado atual (ou oferece memória + kickoff), abre o Claude
project exit                        # commita e dá push em tudo, oferece commitar a memória, limpa o workfolder
```

O `create` usa o `new-project.sh` por baixo: o nome do repo é o nome da memória, o `CLAUDE.md` entra no commit inicial
e a memória é commitada e enviada no dev-brain na hora. O Claude abre já rodando a skill `kickoff`, que conversa
com você e preenche README, arquitetura, decisões e roadmap da memória. Daí em diante, cada feature segue a `implementar`.

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

## Implementando: skill `implementar`

Toda implementação vira trabalho de um time:
1. o agente da sessão (Opus) planeja com você e grava a spec em `memory/<projeto>/specs/AAAA-MM-DD-<slug>.md`
   (modelo em `global/skills/implementar/spec-template.md`), com as tarefas num bloco YAML;
2. `spec-check` valida as tarefas e calcula as **ondas** (tarefas sem dependência entre si e com arquivos disjuntos rodam juntas);
3. o workflow `time-de-agentes` (`global/workflows/time.js`) roda cada onda:
   dev → gate da tarefa → (escada) → gate da onda → commit por tarefa → revisão Sonnet → correções;
4. escada por tamanho: **P** Haiku → Haiku → Sonnet; **M** Sonnet → Sonnet; depois disso a tarefa bloqueia e vai para o resumo;
5. o Opus lê o resultado e o diff consolidado uma vez, roda a QA de interface (`qa-browser`: `chrome-windows` no WSL,
   Claude in Chrome no Linux/macOS) e fecha a memória com a tabela de métricas.

Depois do seu "ok" na spec, o time roda sozinho até o resumo. Acompanhe pelo `/workflows` ou pelo Habblaud.
Subagentes ficam em `global/agents/`: `dev-rapido`, `dev`, `gate`, `commit`, `revisor`, `qa-browser`.

O `project start` mostra o `estado-atual.md` do projeto ao abrir.

## Visibilidade: Habblaud

O [Habblaud](https://github.com/marmottajr/habblaud) mostra as sessões e subagentes do Claude Code como um escritório
em pixel art (`http://localhost:4747`): quem está trabalhando, quem precisa de você e o uso de 5h/semanal.
Roda local e só lê os arquivos que o Claude Code já grava.

```bash
git clone https://github.com/marmottajr/habblaud.git ~/habblaud && cd ~/habblaud
npm install
npm run docker:up        # macOS/WSL; no Linux nativo, veja abaixo
npm run mod:install      # uso de 5h/semanal, aprovar permissões e mandar mensagens pelo escritório
```

**Linux nativo:** o container roda com UID 1000 e não lê `~/.claude/projects` e `~/.claude/sessions` (permissão 700)
se o seu usuário tiver outro UID (`id -u`). Nesse caso, rode em modo Node como serviço do seu usuário:

```bash
cd ~/habblaud && npm run build
mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/habblaud.service <<'UNIT'
[Unit]
Description=Habblaud
After=network.target

[Service]
WorkingDirectory=%h/habblaud
ExecStart=/usr/bin/env node dist/server/index.js
Environment=HABBLAUD_HOST=127.0.0.1
Restart=on-failure

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload && systemctl --user enable --now habblaud
```

Atualizar: `git pull && npm install && npm run build` (ou `npm run docker:up`), depois `npm run mod:install`.
Desinstalar: `npm run mod:uninstall` e pare o serviço ou o container.
Atenção: o plugin de mensagens deixa qualquer processo local mandar prompts às sessões abertas; com o alias de bypass,
isso vira execução sem aprovação. Para ficar sem ele: `npm run mod:install -- --sem-mensagens`.

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
