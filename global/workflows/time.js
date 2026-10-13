export const meta = {
  name: 'time-de-agentes',
  description: 'Implementa as tarefas de uma spec do dev-brain em ondas: dev, gate, commit, revisão e escada',
  whenToUse: 'Chamado pela skill implementar do dev-brain, com a saída do bin/spec-check em args',
}

// args: saída do spec-check ({tarefas, gates, ondas}) + {repo, spec, memoria, base}
const DEGRAUS = { P: ['dev-rapido', 'dev-rapido', 'dev'], M: ['dev', 'dev'] }
const MODELO = { 'dev-rapido': 'haiku', dev: 'sonnet' }
const MAX_REVISOES = 2

const DEV_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pronto', 'spec_invalida'] },
    arquivos: { type: 'array', items: { type: 'string' } },
    resumo: { type: 'string' },
    motivo: { type: 'string' },
  },
  required: ['status', 'arquivos', 'resumo'],
}
const GATE_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, exit_code: { type: 'integer' }, saida: { type: 'string' } },
  required: ['ok', 'exit_code', 'saida'],
}
const REVISAO_SCHEMA = {
  type: 'object',
  properties: {
    tarefas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          aprovada: { type: 'boolean' },
          problemas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                arquivo: { type: 'string' },
                linha: { type: ['integer', 'null'] },
                evidencia: { type: 'string' },
                correcao: { type: 'string' },
              },
              required: ['arquivo', 'evidencia', 'correcao'],
            },
          },
        },
        required: ['id', 'aprovada', 'problemas'],
      },
    },
  },
  required: ['tarefas'],
}

const { repo, spec, memoria, tarefas, gates, ondas } = args
const porId = Object.fromEntries(tarefas.map((t) => [t.id, t]))
const estados = Object.fromEntries(tarefas.map((t) => [t.id, {
  id: t.id, tamanho: t.tamanho, status: 'pendente', motivo: null, modelos: [], tentativas: 0,
  revisoes: 0, commits: [], pendencias: [], arquivos: [...t.arquivos], degrau: 0, extra: false,
}]))
const resumoOndas = []

const lista = (xs) => xs.map((x) => `- ${x}`).join('\n')
const textoErro = (e) => (e && e.message) || String(e)
// Aspas simples de shell (mesma regra do spec-check): it's -> 'it'\''s'
const aspas = (c) => `'${c.replace(/'/g, "'\\''")}'`

// Chama um agente; se ele lançar (tipo inexistente, erro de API), devolve null como um agente que morreu.
async function chamar(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    log(`${opts.label}: ${textoErro(e)}`)
    return null
  }
}

function bloquear(t, motivo, pendencia) {
  const est = estados[t.id]
  est.status = 'bloqueada'
  est.motivo = motivo
  if (pendencia) est.pendencias.push(pendencia)
}

function promptDev(t, falha) {
  return [
    `Repo: ${repo}`,
    `Spec (fonte de verdade): ${spec}`,
    `Memória do projeto: ${memoria}`,
    `Sua tarefa: ${t.id}. ${t.titulo}`,
    `Arquivos permitidos:\n${lista(t.arquivos.length ? t.arquivos : ['(não declarados: limite-se ao escopo da tarefa)'])}`,
    t.referencia ? `Referência de padrão: ${t.referencia}` : '',
    `Critérios de aceite:\n${lista(t.aceite)}`,
    `Gate da tarefa (rode antes de terminar): ${t.gate}`,
    falha ? `A tentativa anterior falhou. Resolva isto primeiro:\n${falha}` : '',
  ].filter(Boolean).join('\n\n')
}

// O comando vai em base64: nem o agente nem hooks do shell (ex.: proxies que reescrevem `npx vitest`) mudam o que roda.
async function rodarGate(cmd, label, fase) {
  const g = await chamar(`Diretório: ${repo}\nComando:\necho '${base64(cmd)}' | base64 -d | bash`, {
    agentType: 'gate', model: 'haiku', effort: 'low', schema: GATE_SCHEMA, label, phase: fase,
  })
  return g || { ok: false, exit_code: -1, saida: 'o agente de gate não respondeu' }
}

// Exceção dentro da escada bloqueia a tarefa; sem isso ela ficaria 'pendente' e seria tratada como pronta.
function escadaSegura(t, fase, falhaInicial, permitirExtra, motivoFalha) {
  return escada(t, fase, falhaInicial, permitirExtra, motivoFalha).catch((e) => {
    bloquear(t, 'erro', textoErro(e))
    return false
  })
}

// Sobe a escada da tarefa até o gate passar. true = passou; false = bloqueada (motivo já gravado).
async function escada(t, fase, falhaInicial, permitirExtra, motivoFalha) {
  const est = estados[t.id]
  let falha = falhaInicial
  for (;;) {
    let tipo
    if (est.degrau < DEGRAUS[t.tamanho].length) {
      tipo = DEGRAUS[t.tamanho][est.degrau]
      est.degrau += 1
    } else if (permitirExtra && !est.extra) {
      est.extra = true
      tipo = 'dev'
    } else {
      bloquear(t, motivoFalha, falha)
      return false
    }
    est.tentativas += 1
    est.modelos.push(MODELO[tipo])
    const r = await agent(promptDev(t, falha), {
      agentType: tipo, model: MODELO[tipo], schema: DEV_SCHEMA,
      label: `t${t.id} ${MODELO[tipo]} #${est.tentativas}`, phase: fase,
    })
    if (!r) {
      falha = 'o agente dev não respondeu'
      continue
    }
    if (r.status === 'spec_invalida') {
      bloquear(t, 'spec', r.motivo || r.resumo)
      return false
    }
    for (const a of r.arquivos) if (!est.arquivos.includes(a)) est.arquivos.push(a)
    const g = await rodarGate(t.gate, `t${t.id} gate #${est.tentativas}`, fase)
    if (g.ok) return true
    falha = `Gate da tarefa falhou (exit ${g.exit_code}):\n${g.saida}`
  }
}

// base64 de texto UTF-8 (o script do Workflow não tem Buffer nem btoa garantidos).
function base64(texto) {
  const bytes = []
  for (const ch of texto) {
    const c = ch.codePointAt(0)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let s = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0)
    s += A[n >> 18] + A[(n >> 12) & 63]
    s += i + 1 < bytes.length ? A[(n >> 6) & 63] : '='
    s += i + 2 < bytes.length ? A[n & 63] : '='
  }
  return s
}

// Commit determinístico: o script é montado aqui e o agente `gate` só executa (ver rodarGate).
// Nenhum LLM escreve a mensagem, e o script falha se o commit sair com atribuição de IA.
function scriptCommit(itens) {
  const linhas = ['set -e']
  itens.forEach((c, i) => {
    for (const a of c.arquivos) linhas.push(`git add -A -- ${aspas(a)} 2>/dev/null || true`)
    linhas.push(
      'if git diff --cached --quiet; then',
      `  echo "SHA ${i} -"`,
      'else',
      `  git commit -q -F - <<'MSG_${i}'`,
      c.mensagem,
      `MSG_${i}`,
      `  if git log -1 --format=%B | grep -qiE 'co-authored-by|generated with'; then echo "ATRIBUICAO ${i}"; exit 3; fi`,
      `  echo "SHA ${i} $(git rev-parse --short HEAD)"`,
      'fi',
    )
  })
  return `${linhas.join('\n')}\n`
}

// itens: [{id|null, mensagem, arquivos}]. Devolve null se deu certo, ou o texto do erro.
async function commitar(itens, fase, label) {
  if (!itens.length) return null
  const g = await rodarGate(scriptCommit(itens), label, fase)
  // Tolera texto em volta (o agente às vezes comenta a saída); vale o 1º SHA de cada item.
  const vistos = new Set()
  for (const m of g.saida.matchAll(/SHA (\d+) ([0-9a-f]{7,40})\b/g)) {
    const item = itens[Number(m[1])]
    if (vistos.has(m[1]) || !item || item.id === null) continue
    vistos.add(m[1])
    estados[item.id].commits.push(m[2])
  }
  return g.ok ? null : `commit falhou (exit ${g.exit_code}):\n${g.saida}`
}

// Tarefa bloqueada não pode deixar código pela metade no disco (quebraria o gate da onda e as ondas seguintes).
// Guarda as alterações dela em stash, um de cada vez, para o usuário recuperar se quiser.
async function guardar(ts, fase) {
  for (const t of ts) {
    const arqs = estados[t.id].arquivos
    if (!arqs.length) continue
    const msg = `time-de-agentes: tarefa ${t.id} bloqueada`
    // Só caminhos que existem ou estão no índice: um caminho inexistente faria o stash inteiro falhar.
    const script = [
      'set --',
      ...arqs.map((a) => `if [ -e ${aspas(a)} ] || git ls-files --error-unmatch -- ${aspas(a)} >/dev/null 2>&1; then set -- "$@" ${aspas(a)}; fi`),
      `if [ $# -gt 0 ]; then git stash push -u -m '${msg}' -- "$@"; else echo 'nada para guardar'; fi`,
    ].join('\n')
    const g = await rodarGate(`${script}\n`, `t${t.id} guardar`, fase)
    estados[t.id].pendencias.push(g.ok
      ? `alterações guardadas em git stash ("${msg}")`
      : `não consegui guardar as alterações em git stash: ${g.saida}`)
  }
}

async function revisar(ts, fase, rodada) {
  const corpo = ts.map((t) => `- tarefa ${t.id} (${t.titulo}): commits ${estados[t.id].commits.join(' ') || '(nenhum)'}`).join('\n')
  return chamar(`Repo: ${repo}\nSpec: ${spec}\nMemória: ${memoria}\nRevise estas tarefas:\n${corpo}`, {
    agentType: 'revisor', model: 'sonnet', schema: REVISAO_SCHEMA, label: `revisão #${rodada}`, phase: fase,
  })
}

const formatarProblemas = (ps) =>
  ps.map((p) => `${p.arquivo}${p.linha ? `:${p.linha}` : ''}: ${p.evidencia} -> ${p.correcao}`).join('\n')

let parar = null
for (let i = 0; i < ondas.length; i++) {
  const n = i + 1
  const fase = `Onda ${n}`
  const info = { n, tarefas: ondas[i], gate: 'pulada', correcao_onda: false }
  resumoOndas.push(info)
  const daOnda = ondas[i].map((id) => porId[id])

  if (parar) {
    for (const t of daOnda) Object.assign(estados[t.id], { status: 'pulada', motivo: parar })
    continue
  }

  // 1. Implementação: escada por tarefa, sem esperar as outras.
  const executaveis = []
  for (const t of daOnda) {
    const dep = t.depende.find((d) => estados[d].status !== 'ok')
    if (dep !== undefined) Object.assign(estados[t.id], { status: 'pulada', motivo: `depende de ${dep}` })
    else executaveis.push(t)
  }
  if (!executaveis.length) {
    log(`${fase}: nada a executar`)
    continue
  }
  log(`${fase}: tarefas ${executaveis.map((t) => t.id).join(', ')}`)
  await pipeline(executaveis, (t) => escadaSegura(t, fase, null, false, 'escada'))
  await guardar(executaveis.filter((t) => estados[t.id].status === 'bloqueada'), fase)

  // 2. Barreira: o gate da onda precisa de todas prontas.
  const prontas = executaveis.filter((t) => estados[t.id].status === 'pendente')
  if (!prontas.length) continue

  // 3. Gate da onda, com 1 correção.
  let extrasOnda = []
  let g = await rodarGate(gates.onda, `gate onda ${n}`, fase)
  if (!g.ok) {
    info.correcao_onda = true
    const r = await chamar([
      `Repo: ${repo}`,
      `Spec (fonte de verdade): ${spec}`,
      `Memória do projeto: ${memoria}`,
      `O gate da onda falhou depois das tarefas ${prontas.map((t) => t.id).join(', ')}. Corrija sem sair do escopo delas.`,
      `Arquivos das tarefas:\n${lista(prontas.flatMap((t) => estados[t.id].arquivos))}`,
      `Gate da onda (rode antes de terminar): ${gates.onda}`,
      `Saída (exit ${g.exit_code}):\n${g.saida}`,
    ].join('\n\n'), {
      agentType: 'dev', model: 'sonnet', schema: DEV_SCHEMA, label: `correção onda ${n}`, phase: fase,
    })
    if (r && r.status === 'pronto') extrasOnda = r.arquivos
    g = await rodarGate(gates.onda, `gate onda ${n} #2`, fase)
  }
  if (!g.ok) {
    info.gate = 'bloqueada'
    info.saida_gate = g.saida
    for (const t of prontas) bloquear(t, 'gate_onda', `Gate da onda ${n} falhou (exit ${g.exit_code})`)
    parar = `onda ${n} bloqueada`
    continue
  }
  info.gate = 'ok'

  // 4. Commit: um por tarefa; arquivos da correção fora de qualquer tarefa vão num commit próprio.
  const conhecidos = new Set(prontas.flatMap((t) => estados[t.id].arquivos))
  const soltos = extrasOnda.filter((a) => !conhecidos.has(a))
  const itens = prontas.map((t) => ({ id: t.id, mensagem: `${t.titulo} (tarefa ${t.id})`, arquivos: estados[t.id].arquivos }))
  if (soltos.length) itens.push({ id: null, mensagem: `fix: gate da onda ${n}`, arquivos: soltos })
  const erroCommit = await commitar(itens, fase, `commit onda ${n}`)
  if (erroCommit) {
    for (const t of prontas) bloquear(t, 'commit', erroCommit)
    parar = `commit da onda ${n} falhou`
    continue
  }

  // 5. Revisão por onda; reprovadas voltam para a escada.
  let pendentes = prontas
  let houveCorrecao = false
  for (let rodada = 1; rodada <= MAX_REVISOES && pendentes.length; rodada++) {
    const v = await revisar(pendentes, fase, rodada)
    const vereditos = new Map((v ? v.tarefas : []).map((x) => [x.id, x]))
    const reprovadas = []
    for (const t of pendentes) {
      const est = estados[t.id]
      est.revisoes += 1
      const ver = vereditos.get(t.id)
      if (!ver) {
        est.status = 'ok'
        est.pendencias.push('o revisor não devolveu veredito; conferir na leitura final')
      } else if (ver.aprovada) {
        est.status = 'ok'
      } else if (rodada === MAX_REVISOES) {
        bloquear(t, 'revisao', formatarProblemas(ver.problemas))
      } else {
        reprovadas.push({ t, problemas: formatarProblemas(ver.problemas) })
      }
    }
    if (!reprovadas.length) break
    await pipeline(reprovadas, ({ t, problemas }) => escadaSegura(t, fase, `O revisor reprovou:\n${problemas}`, true, 'revisao'))
    await guardar(reprovadas.map((r) => r.t).filter((t) => estados[t.id].status === 'bloqueada'), fase)
    const corrigidas = reprovadas.map((r) => r.t).filter((t) => estados[t.id].status === 'pendente')
    if (corrigidas.length) {
      houveCorrecao = true
      const erro = await commitar(
        corrigidas.map((t) => ({ id: t.id, mensagem: `fix: ${t.titulo} (tarefa ${t.id})`, arquivos: estados[t.id].arquivos })),
        fase, `commit correções onda ${n}`,
      )
      if (erro) {
        for (const t of corrigidas) bloquear(t, 'commit', erro)
        parar = `commit das correções da onda ${n} falhou`
        break
      }
    }
    pendentes = corrigidas
  }

  // 6. Correções da revisão passam de novo pelo gate da onda.
  if (houveCorrecao && !parar) {
    const g2 = await rodarGate(gates.onda, `gate onda ${n} pós-revisão`, fase)
    info.gate_pos_revisao = g2.ok ? 'ok' : 'falhou'
    if (!g2.ok) {
      info.saida_gate = g2.saida
      parar = `gate da onda ${n} falhou depois das correções da revisão`
    }
  }
}

return {
  tarefas: tarefas.map((t) => {
    const { degrau, extra, arquivos, ...resto } = estados[t.id]
    return resto
  }),
  ondas: resumoOndas,
}
