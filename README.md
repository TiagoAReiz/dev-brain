# dev-brain

Fonte única do meu workflow com IA: memória por projeto, skills, `CLAUDE.md` global e setup de máquina nova.
É só markdown, shell e git: sem RAG, banco de dados ou servidor.

## Começo rápido

Cole isto no Claude Code e deixe ele fazer:

> Instale o dev-brain: clone https://github.com/TiagoAReiz/dev-brain.git em ~/dev-brain e rode ~/dev-brain/bootstrap.sh. Depois me ajude a configurar a memória do meu projeto com a skill kickoff.

Ou na mão (Linux, macOS ou WSL; o repo é público, sem login):

```bash
git clone https://github.com/TiagoAReiz/dev-brain.git ~/dev-brain
~/dev-brain/bootstrap.sh
```

Pronto. Abra o `claude` no seu projeto e peça o que quiser: mudanças de código seguem a skill `implementar` sozinhas.
As memórias ficam só com você (pasta local `memory/`); veja "Memória privada" para versionar num repo seu.
Máquina nova inteira (ferramentas, Habblaud): `~/dev-brain/setup.sh`. Atualizar: `git -C ~/dev-brain pull`.

## Estrutura

```
install-tools.sh      # instala ferramentas de dev no Ubuntu/WSL (apt + nvm + claude) e configura bash/fish
bootstrap.sh          # configura a máquina (symlinks + checagem de deps)
new-project.sh        # cria memória + CLAUDE.md de um projeto novo
bin/brain             # comando do dia a dia (sobe, desce, status, setup) -> ~/.local/bin/brain
bin/project           # CLI create/start/exit de projetos em ~/workfolder -> ~/.local/bin/project
bin/spec-check        # valida as tarefas de uma spec e calcula as ondas -> ~/.local/bin/spec-check
setup.sh              # configura um PC novo do zero (chama os scripts abaixo)
up.sh / down.sh       # sobe e desce o ambiente (dev-brain + Habblaud)
lib/                  # código usado pelos scripts e bins (spec-check, habblaud.sh)
global/CLAUDE.md      # instruções globais  -> ~/.claude/CLAUDE.md
global/skills/<nome>/ # uma pasta por skill -> ~/.claude/skills/<nome>
global/agents/<nome>.md # subagentes do time -> ~/.claude/agents/<nome>.md
global/workflows/     # scripts de Workflow (time.js: o time de agentes)
templates/            # modelos usados pelo new-project.sh
memory/README.md      # índice de projetos (repo privado à parte, ver "Memória privada")
memory/<projeto>/     # README, arquitetura, estado-atual, decisoes, roadmap, specs/
docs/                 # specs e planos do próprio dev-brain
exemplos/sandbox/     # repo de teste do time de agentes
habblaud/             # Habblaud (git subtree, nosso fork): escritório visual dos agentes
tests/                # node --test 'tests/*.test.cjs' && for t in tests/*.test.sh; do bash "$t"; done
```

## Uso: `brain`

Um comando para o dia a dia, de qualquer pasta (bash ou fish), ou pelo ícone **Dev Brain** no menu de aplicativos:

```bash
brain            # sobe tudo (pull do dev-brain, Habblaud) e abre o Habblaud numa janela de app
brain down       # desce: desliga o Habblaud e oferece salvar a memória no GitHub
brain status     # o que está no ar e o que falta enviar
brain setup      # configura este PC (o mesmo que ./setup.sh)
```

Os projetos você abre pelos botões **Iniciar dia** e **Finalizar dia** no Habblaud, ou com `project start` / `project create` (ver "Dia a dia: `project`").
O log da última subida fica em `~/.habblaud/brain.log`.

## PC novo

```bash
git clone https://github.com/TiagoAReiz/dev-brain.git ~/dev-brain && ~/dev-brain/setup.sh
```

Se você é o dono e tem acesso à memória privada, clone-a depois: `git clone git@github.com:TiagoAReiz/dev-brain-memory.git ~/dev-brain/memory`.

O `setup.sh` é idempotente e faz, em ordem: ferramentas (`install-tools.sh`), login no GitHub, links (`bootstrap.sh`:
`CLAUDE.md`, skills, subagentes, `brain`, `project`, `spec-check` e o ícone **Dev Brain** no menu) e o Habblaud
(build, serviço `systemd --user` e mod no Claude Code). No fim lista o que ficou para fazer na mão
(login no Claude Code, `git config`, chave SSH). Máquina que já tem as ferramentas: `brain setup --sem-ferramentas`.

## Por baixo do `brain`

```bash
~/dev-brain/up.sh      # pull do dev-brain, rebuild do Habblaud se o código mudou, liga e abre http://localhost:4747
~/dev-brain/down.sh    # desliga o Habblaud (até o próximo up), oferece commit/push da memória, avisa de projetos no workfolder
```

Com systemd do usuário o Habblaud volta sozinho no login, até você rodar o `brain down`. Sem systemd (macOS), só pelo `brain`.
O `brain` funciona aberto pelo menu (sem o PATH do terminal) porque reaproveita o PATH gravado no serviço pelo setup.

### Partes avulsas

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

## Dia a dia pelo Habblaud

Abra pelo ícone **Dev Brain** ou rode `brain`. No header:

- **Iniciar dia**: escolha continuar um repo (lista com busca, memórias primeiro) ou criar um projeto (privado por padrão). O projeto fica em `~/workfolder` e o Claude abre no terminal interativo do Habblaud. Projeto novo ou memória recém-criada abre com o kickoff.
- **Finalizar dia**: confira sessões, projetos pendentes, riscos e memória; confirme para encerrar as sessões locais do Claude, salvar no GitHub e limpar o que foi salvo. O relatório mostra pastas mantidas e falhas. Alguns segundos depois, o Habblaud desliga. Para voltar, abra o ícone ou rode `brain`.

Os botões só funcionam neste computador, com terminal interativo habilitado; ficam indisponíveis no acesso remoto e no timelapse. Codex e outros agentes não gerenciados aparecem no resumo e não são encerrados pelo botão.

A limpeza automática mantém pastas com `.env` fora do Git, arquivos ignorados (inclusive caches), stash, submódulos, Git aninhado ou falhas ao salvar/verificar o remoto. Symlinks e arquivos avulsos ficam no disco. Se uma sessão não encerrar, a finalização para antes de salvar ou limpar. Um `CLAUDE.md` existente nunca é sobrescrito para criar memória.

O último relatório fica em `~/.habblaud/ultimo-dia.json` (ou no diretório definido por `HABBLAUD_DATA_DIR`), inclusive depois que o servidor desliga. Falhas de push aparecem no relatório; os dados preservados continuam nesta máquina para resolver depois.

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
- há `.env` fora do Git, outros arquivos ignorados, submódulos ou worktree compartilhado;
- o commit ou o push falhou, ou o HEAD está destacado;
- há commits em outras branches locais que não estão no remoto, ou há stash.

Se o push da branch atual falhar (ex.: divergiu), ele envia o HEAD para `wip/<data-hora>` sem trocar de branch.
Arquivos soltos no workfolder nunca são apagados. O Claude aberto pelo CLI interativo usa `--dangerously-skip-permissions`; o terminal do Habblaud mantém o comportamento de permissões do próprio Habblaud.

### Integração sem perguntas

O Habblaud usa estes modos da mesma CLI; stdout contém somente JSON e os erros vão para stderr:

```bash
project repos --json
project preparar dono/repo --json
project create meu-app --private --sem-claude --json
project resumo --json
project exit --sem-perguntas --json
```

No modo automático, pastas com riscos ficam preservadas. A verificação antes de limpar busca as branches atuais do `origin`; refs locais antigas ou commits que só existem em outro remoto não bastam. Falhas de criação mantêm a pasta e a memória e indicam os caminhos para recuperação.

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
Subagentes ficam em `global/agents/`: `dev-rapido`, `dev`, `gate`, `revisor`, `qa-browser`. O commit é um script montado pelo `time.js` (sem LLM escrevendo a mensagem) e falha se aparecer atribuição de IA.

O `project start` mostra o `estado-atual.md` do projeto ao abrir.

## Visibilidade: Habblaud

O [Habblaud](https://github.com/marmottajr/habblaud) mostra as sessões e subagentes do Claude Code como um escritório
em pixel art (`http://localhost:4747`): quem está trabalhando, quem precisa de você e o uso de 5h/semanal.
Roda local e só lê os arquivos que o Claude Code já grava.

Ele vive **dentro do dev-brain**, em `habblaud/`, como `git subtree` (licença MIT em `habblaud/LICENSE`): é o nosso
fork, com as nossas mudanças versionadas junto com o resto. Para trazer novidades do original:

```bash
git -C ~/dev-brain remote add habblaud-upstream https://github.com/marmottajr/habblaud.git   # uma vez
git -C ~/dev-brain subtree pull --prefix=habblaud habblaud-upstream main --squash
```

Instalar numa máquina:

```bash
cd ~/dev-brain/habblaud
npm install && npm approve-scripts node-pty && npm rebuild node-pty
npm run docker:up        # macOS/WSL; no Linux nativo, veja abaixo
npm run mod:install      # uso de 5h/semanal, aprovar permissões e mandar mensagens pelo escritório
```

**Linux nativo:** o container roda com UID 1000 e não lê `~/.claude/projects` e `~/.claude/sessions` (permissão 700)
se o seu usuário tiver outro UID (`id -u`). Nesse caso, rode em modo Node como serviço do seu usuário:

```bash
cd ~/dev-brain/habblaud && npm run build
# o systemd do usuário não enxerga o PATH do nvm: grava o caminho absoluto do node
mkdir -p ~/.config/systemd/user && cat > ~/.config/systemd/user/habblaud.service <<UNIT
[Unit]
Description=Habblaud
After=network.target

[Service]
WorkingDirectory=%h/dev-brain/habblaud
ExecStart=$(command -v node) dist/server/index.js
Environment=HABBLAUD_HOST=127.0.0.1
Environment=HABBLAUD_PTY=1
Environment="PATH=$PATH"
Restart=on-failure

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload && systemctl --user enable --now habblaud
```

`HABBLAUD_PTY=1` liga o terminal interativo e o botão **Novo agente** (controlar e abrir sessões pelo escritório);
o `PATH` copiado faz as sessões abertas por lá acharem `claude`, `node` e os bins do dev-brain. Mesmo aviso das mensagens: qualquer programa local
que fale com `localhost:4747` ganha esse controle. Ditado por voz: `sudo apt install ffmpeg` + `whisper-cli` e um modelo em `~/.local/share/whisper/`.

O serviço sobe no seu login. Para subir também sem login (máquina remota): `sudo loginctl enable-linger $USER`.
Trocou a versão do node no nvm? Rode o bloco de novo.

Atualizar: `git pull && npm install && npm run build` (ou `npm run docker:up`), depois `npm run mod:install`.
Desinstalar: `npm run mod:uninstall` e pare o serviço ou o container.
Atenção: o plugin de mensagens deixa qualquer processo local mandar prompts às sessões abertas; com o alias de bypass,
isso vira execução sem aprovação. Para ficar sem ele: `npm run mod:install -- --sem-mensagens`.

## Memória privada

Este repo é público e **não contém memórias**: `memory/` está no `.gitignore` e é um repo git separado (privado).

- **Com acesso à memória:** `git clone git@github.com:<voce>/dev-brain-memory.git ~/dev-brain/memory`.
- **Sem acesso (quem só copiou o dev-brain):** nada a fazer. Sem `memory/.git`, os scripts criam a pasta local e avisam que ela não é versionada;
  o `new-project.sh` cria `memory/` com um índice novo; se quiser versionar, rode `git -C memory init` num repo seu.
- Os comandos de commit/push da memória (`bin/project`, `down.sh`, skills `implementar` e `kickoff`) sempre rodam em `memory/`, nunca neste repo.

## Atualizando a memória

- O agente propõe atualizar `estado-atual.md` e `decisoes.md` no fim das sessões relevantes e mostra o diff antes de gravar.
- Revise e commite na memória: `git -C ~/dev-brain/memory add -A && git -C ~/dev-brain/memory commit -m "memory(<projeto>): ..." && git -C ~/dev-brain/memory push`
- Em outra máquina: `git -C ~/dev-brain pull` (código) e `git -C ~/dev-brain/memory pull` (memória). Os symlinks já apontam para o repo, então não é preciso fazer mais nada.
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
