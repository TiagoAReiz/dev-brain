'use strict';
// spec-check: valida o bloco de tarefas e gates de uma spec do dev-brain e calcula as ondas.
// Lógica pura; o bin/spec-check só faz I/O.

const LIMITE_P = { arquivos: 3, aceite: 5 };
const GLOB = /[*?[\]{}]/;

const ehTexto = (v) => typeof v === 'string' && v.trim() !== '';

// Aspas simples de shell: it's -> 'it'\''s'
const aspas = (caminho) => `'${caminho.replace(/'/g, "'\\''")}'`;

function validarTarefa(t, i, erros) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    erros.push(`tarefa #${i + 1}: não é um objeto`);
    return;
  }
  const nome = Number.isInteger(t.id) ? `tarefa ${t.id}` : `tarefa #${i + 1}`;
  if (!Number.isInteger(t.id) || t.id < 1) erros.push(`${nome}: id deve ser inteiro positivo`);
  if (!ehTexto(t.titulo)) erros.push(`${nome}: titulo obrigatório`);
  else if (/[\r\n]/.test(t.titulo)) erros.push(`${nome}: titulo deve ter uma linha (vira a mensagem do commit)`);
  if (t.tamanho !== 'P' && t.tamanho !== 'M') erros.push(`${nome}: tamanho deve ser P ou M`);
  if (!Array.isArray(t.aceite) || t.aceite.length === 0 || !t.aceite.every(ehTexto)) {
    erros.push(`${nome}: aceite precisa de ao menos 1 critério em texto`);
  }
  if (t.arquivos !== undefined) {
    if (!Array.isArray(t.arquivos) || !t.arquivos.every(ehTexto)) {
      erros.push(`${nome}: arquivos deve ser uma lista de caminhos`);
    } else {
      for (const a of t.arquivos) if (GLOB.test(a)) erros.push(`${nome}: arquivo com glob não é permitido (${a})`);
    }
  }
  if (t.depende !== undefined && (!Array.isArray(t.depende) || !t.depende.every(Number.isInteger))) {
    erros.push(`${nome}: depende deve ser uma lista de ids`);
  }
  if (t.referencia !== undefined && !ehTexto(t.referencia)) erros.push(`${nome}: referencia deve ser um caminho`);
  if (t.tamanho === 'P') {
    if (Array.isArray(t.arquivos) && t.arquivos.length > LIMITE_P.arquivos) {
      erros.push(`${nome}: tarefa P toca no máximo ${LIMITE_P.arquivos} arquivos (divida ou marque M)`);
    }
    if (Array.isArray(t.aceite) && t.aceite.length > LIMITE_P.aceite) {
      erros.push(`${nome}: tarefa P tem no máximo ${LIMITE_P.aceite} critérios (divida ou marque M)`);
    }
  }
}

// Fail-safe: sem arquivos ou sem depende, a tarefa depende de todas as de id menor e roda sozinha.
function normalizar(tarefas, gateTarefa) {
  const ordenadas = [...tarefas].sort((a, b) => a.id - b.id);
  return ordenadas.map((t) => {
    const failsafe = !Array.isArray(t.arquivos) || !Array.isArray(t.depende);
    const arquivos = Array.isArray(t.arquivos) ? [...t.arquivos] : [];
    const declaradas = Array.isArray(t.depende) ? t.depende : [];
    const anteriores = failsafe ? ordenadas.filter((o) => o.id < t.id).map((o) => o.id) : [];
    const depende = [...new Set([...anteriores, ...declaradas])].sort((a, b) => a - b);
    const n = {
      id: t.id,
      titulo: t.titulo,
      tamanho: t.tamanho,
      arquivos,
      depende,
      aceite: [...t.aceite],
      failsafe,
      gate: gateTarefa.split('{arquivos}').join(arquivos.map(aspas).join(' ')),
    };
    if (t.referencia) n.referencia = t.referencia;
    return n;
  });
}

// Ordem topológica, menor id primeiro entre as prontas. null se houver ciclo.
function ordenar(tarefas) {
  const pendentes = new Map(tarefas.map((t) => [t.id, new Set(t.depende)]));
  const ordem = [];
  while (pendentes.size) {
    const prontas = [...pendentes].filter(([, deps]) => deps.size === 0).map(([id]) => id);
    if (!prontas.length) return null;
    const id = Math.min(...prontas);
    pendentes.delete(id);
    for (const deps of pendentes.values()) deps.delete(id);
    ordem.push(tarefas.find((t) => t.id === id));
  }
  return ordem;
}

// Guloso: cada tarefa entra na primeira onda depois das suas dependências sem colisão de arquivos.
function calcularOndas(ordem) {
  const ondas = [];
  const ondaDe = new Map();
  let minimo = 0;
  for (const t of ordem) {
    let inicio = minimo;
    for (const d of t.depende) inicio = Math.max(inicio, ondaDe.get(d) + 1);
    let idx = -1;
    if (!t.failsafe) {
      for (let i = inicio; i < ondas.length; i++) {
        if (!ondas[i].fechada && !t.arquivos.some((a) => ondas[i].arquivos.has(a))) {
          idx = i;
          break;
        }
      }
    }
    if (idx === -1) {
      ondas.push({ ids: [], arquivos: new Set(), fechada: t.failsafe });
      idx = ondas.length - 1;
    }
    ondas[idx].ids.push(t.id);
    for (const a of t.arquivos) ondas[idx].arquivos.add(a);
    ondaDe.set(t.id, idx);
    if (t.failsafe) minimo = idx + 1;
  }
  return ondas.map((o) => o.ids);
}

function checar(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { ok: false, erros: ['entrada deve ser um objeto {tarefas, gates}'] };
  }
  const { tarefas, gates } = entrada;
  const erros = [];
  if (!Array.isArray(tarefas) || tarefas.length === 0) erros.push('tarefas: lista vazia ou ausente');
  if (!gates || !ehTexto(gates.tarefa)) erros.push('gates.tarefa: comando obrigatório');
  if (!gates || !ehTexto(gates.onda)) erros.push('gates.onda: comando obrigatório');
  if (Array.isArray(tarefas)) tarefas.forEach((t, i) => validarTarefa(t, i, erros));
  if (erros.length) return { ok: false, erros };

  const ids = new Set();
  for (const t of tarefas) {
    if (ids.has(t.id)) erros.push(`tarefa ${t.id}: id repetido`);
    ids.add(t.id);
  }
  for (const t of tarefas) {
    for (const d of t.depende || []) {
      if (d === t.id) erros.push(`tarefa ${t.id}: depende de si mesma`);
      else if (!ids.has(d)) erros.push(`tarefa ${t.id}: depende de id inexistente (${d})`);
    }
  }
  if (erros.length) return { ok: false, erros };

  const normalizadas = normalizar(tarefas, gates.tarefa);
  const ordem = ordenar(normalizadas);
  if (!ordem) return { ok: false, erros: ['ciclo de dependência entre tarefas'] };
  return {
    ok: true,
    saida: { tarefas: normalizadas, gates: { tarefa: gates.tarefa, onda: gates.onda }, ondas: calcularOndas(ordem) },
  };
}

module.exports = { checar };
