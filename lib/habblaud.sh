# lib/habblaud.sh: funções do Habblaud usadas pelo setup.sh, up.sh e down.sh.
# Para usar com `.` (source), não execute direto. Espera DEV_BRAIN_HOME definido.
# Com systemd do usuário (Linux/WSL), roda como serviço; sem ele (macOS), em background com pid em ~/.habblaud.
# shellcheck shell=bash

HB_DIR="$DEV_BRAIN_HOME/habblaud"
HB_URL="http://localhost:${HABBLAUD_PORT:-4747}"
HB_DADOS="${HABBLAUD_DATA_DIR:-$HOME/.habblaud}"
HB_MARCA="$HB_DADOS/dev-brain-build"
HB_PID="$HB_DADOS/server.pid"
HB_UNIT="$HOME/.config/systemd/user/habblaud.service"

# Garante ~/.local/bin no PATH sem passar na frente do que já existe: um `claude` de outro lugar (ex.: o wrapper
# da empresa) continua tendo prioridade sobre o ~/.local/bin/claude.
hb_garantir_local_bin() {
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) PATH="$PATH:$HOME/.local/bin" ;;
  esac
  export PATH
}

# Deixa node, npm e claude no PATH mesmo fora de um terminal (ex.: aberto pelo menu de apps, com o PATH mínimo):
# 1) o PATH gravado na unit do serviço, na frente (é o PATH do seu shell no setup; pode haver um node antigo do
# sistema em /usr/bin); 2) sem unit e sem node, o nvm. Depois garante o ~/.local/bin.
hb_carregar_ambiente() {
  if [ -f "$HB_UNIT" ]; then
    local p
    p="$(sed -n 's/^Environment="PATH=\(.*\)"$/\1/p' "$HB_UNIT" | head -1)"
    [ -z "$p" ] || PATH="$p:$PATH"
  fi
  if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    case $- in
      *u*) set +u; . "$NVM_DIR/nvm.sh"; set -u ;;   # nvm.sh não é compatível com set -u
      *) . "$NVM_DIR/nvm.sh" ;;
    esac
  fi
  hb_garantir_local_bin
}

# HABBLAUD_SEM_SYSTEMD=1 força o modo sem serviço (usado nos testes).
hb_tem_systemd() {
  [ -z "${HABBLAUD_SEM_SYSTEMD:-}" ] && command -v systemctl >/dev/null 2>&1 \
    && systemctl --user show-environment >/dev/null 2>&1
}

# Versão do código: a árvore commitada de habblaud/, com "-sujo" se houver mudança local.
hb_versao() {
  local v
  v="$(git -C "$DEV_BRAIN_HOME" rev-parse HEAD:habblaud 2>/dev/null || echo sem-git)"
  [ -z "$(git -C "$DEV_BRAIN_HOME" status --porcelain -- habblaud 2>/dev/null)" ] || v="$v-sujo"
  printf '%s\n' "$v"
}

# 0 (sim) se não há build, se o código mudou desde o último build ou se há mudança local.
hb_precisa_build() {
  [ -f "$HB_DIR/dist/server/index.js" ] || return 0
  case "$(hb_versao)" in *-sujo) return 0 ;; esac
  [ "$(cat "$HB_MARCA" 2>/dev/null)" != "$(hb_versao)" ]
}

hb_build() {
  (
    cd "$HB_DIR"
    npm install --no-fund --no-audit
    npm approve-scripts node-pty >/dev/null 2>&1 || true   # já liberado no package.json; npm antigo não tem o comando
    npm rebuild node-pty
    npm run build
  )
  mkdir -p "$HB_DADOS"
  hb_versao > "$HB_MARCA"
}

# Instala (ou atualiza) o mod e os plugins do Habblaud no Claude Code, carregados desta pasta.
hb_mod() { (cd "$HB_DIR" && npm run -s mod:install); }

# hb_unit <node> <claude> <PATH>: imprime a unit do systemd.
hb_unit() {
  cat <<EOF
[Unit]
Description=Habblaud (dev-brain)
After=network.target

[Service]
WorkingDirectory=$HB_DIR
ExecStart=$1 dist/server/index.js
Environment=HABBLAUD_HOST=127.0.0.1
Environment=HABBLAUD_PTY=1
Environment="DEV_BRAIN_HOME=$DEV_BRAIN_HOME"
Environment=HABBLAUD_CLAUDE_BIN=$2
Environment="PATH=$3"
Restart=on-failure

[Install]
WantedBy=default.target
EOF
}

# Grava a unit se mudou. HB_UNIT_MUDOU=1 quando gravou.
HB_UNIT_MUDOU=0
hb_instalar_servico() {
  hb_tem_systemd || return 0
  local novo
  novo="$(hb_unit "$(command -v node)" "$(command -v claude || echo claude)" "$PATH")"
  [ "$(cat "$HB_UNIT" 2>/dev/null)" = "$novo" ] && return 0
  mkdir -p "$(dirname "$HB_UNIT")"
  printf '%s\n' "$novo" > "$HB_UNIT"
  systemctl --user daemon-reload
  HB_UNIT_MUDOU=1
}

hb_no_ar() { curl -sf "$HB_URL/api/health" >/dev/null 2>&1; }

hb_esperar() {
  local i
  for i in $(seq 1 30); do hb_no_ar && return 0; sleep 1; done
  return 1
}

hb_parar() {
  if hb_tem_systemd; then
    systemctl --user disable --now habblaud.service >/dev/null 2>&1 || true
  elif [ -f "$HB_PID" ]; then
    kill "$(cat "$HB_PID")" 2>/dev/null || true
    rm -f "$HB_PID"
  fi
}

# Liga e deixa ligado no login. Reiniciar encerra as sessões que o Habblaud abriu.
hb_subir() {
  if hb_tem_systemd; then
    systemctl --user enable habblaud.service >/dev/null 2>&1
    systemctl --user restart habblaud.service
  else
    hb_parar
    mkdir -p "$HB_DADOS"
    (cd "$HB_DIR" && DEV_BRAIN_HOME="$DEV_BRAIN_HOME" HABBLAUD_HOST=127.0.0.1 HABBLAUD_PTY=1 nohup node dist/server/index.js \
      >"$HB_DADOS/server.log" 2>&1 & echo $! > "$HB_PID")
  fi
}

hb_log() {
  if hb_tem_systemd; then echo "journalctl --user -u habblaud -n 50"; else echo "tail -50 $HB_DADOS/server.log"; fi
}

hb_status() {
  curl -sf "$HB_URL/api/health" | node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const s = (d.sources || []).map((x) => `${x.label}: ${x.ok ? x.sessions + " sessão(ões)" : "erro: " + x.error}`);
    console.log(`  Habblaud ${d.version} em ${process.argv[1]}`);
    console.log(`  terminal: ${d.pty ? "ligado" : "desligado"} · mensagens: ${d.messages ? "ligadas" : "desligadas"} · permissões: ${d.permissions ? "ligadas" : "desligadas"}`);
    for (const l of s) console.log(`  ${l}`);
  ' "$HB_URL"
}

# Abre como janela de app (sem barra de endereço) num navegador Chromium; senão, no navegador padrão.
hb_abrir_app() {
  local c
  for c in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser; do
    if command -v "$c" >/dev/null 2>&1; then "$c" --app="$HB_URL" >/dev/null 2>&1 & return 0; fi
  done
  hb_abrir
}

hb_abrir() {
  local c
  for c in xdg-open open wslview; do
    if command -v "$c" >/dev/null 2>&1; then "$c" "$HB_URL" >/dev/null 2>&1 & return 0; fi
  done
  echo "  abra $HB_URL no navegador"
}
