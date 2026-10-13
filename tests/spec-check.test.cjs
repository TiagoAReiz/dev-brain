'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checar } = require('../lib/spec-check.cjs');

const CLI = path.join(__dirname, '..', 'bin', 'spec-check');
const GATES = { tarefa: 'lint {arquivos}', onda: 'test' };
const t = (id, extra = {}) => ({
  id, titulo: `T${id}`, tamanho: 'P', arquivos: [`f${id}.js`], depende: [], aceite: ['ok'], ...extra,
});
const ondas = (tarefas) => {
  const r = checar({ tarefas, gates: GATES });
  assert.ok(r.ok, (r.erros || []).join('\n'));
  return r.saida.ondas;
};
const erros = (entrada) => {
  const r = checar(entrada);
  assert.equal(r.ok, false);
  return r.erros.join('\n');
};

test('tarefas independentes com arquivos disjuntos ficam na mesma onda', () => {
  assert.deepEqual(ondas([t(1), t(2), t(3)]), [[1, 2, 3]]);
});

test('arquivo em comum separa em ondas', () => {
  assert.deepEqual(ondas([t(1), t(2, { arquivos: ['f1.js'] })]), [[1], [2]]);
});

test('dependência vai para a onda seguinte', () => {
  assert.deepEqual(ondas([t(1), t(2, { depende: [1] }), t(3)]), [[1, 3], [2]]);
});

test('dependência transitiva respeita a cadeia', () => {
  assert.deepEqual(
    ondas([t(1), t(2, { depende: [1] }), t(3, { depende: [2] }), t(4)]),
    [[1, 4], [2], [3]],
  );
});

test('dependência para id maior segue a ordem topológica', () => {
  assert.deepEqual(ondas([t(1, { depende: [2] }), t(2)]), [[2], [1]]);
});

test('tarefa sem arquivos roda sozinha e a seguinte abre onda nova', () => {
  assert.deepEqual(ondas([t(1), t(2, { arquivos: undefined }), t(3)]), [[1], [2], [3]]);
});

test('tarefa sem depende vira dependente de todas as anteriores', () => {
  const r = checar({ tarefas: [t(1), t(2), t(3, { depende: undefined })], gates: GATES });
  assert.ok(r.ok);
  assert.deepEqual(r.saida.tarefas[2].depende, [1, 2]);
  assert.equal(r.saida.tarefas[2].failsafe, true);
  assert.deepEqual(r.saida.ondas, [[1, 2], [3]]);
});

test('ciclo é erro', () => {
  assert.match(erros({ tarefas: [t(1, { depende: [2] }), t(2, { depende: [1] })], gates: GATES }), /ciclo/);
});

test('id inexistente em depende é erro', () => {
  assert.match(erros({ tarefas: [t(1, { depende: [9] })], gates: GATES }), /inexistente \(9\)/);
});

test('id repetido é erro', () => {
  assert.match(erros({ tarefas: [t(1), t(1)], gates: GATES }), /repetido/);
});

test('P com mais de 3 arquivos é erro', () => {
  assert.match(erros({ tarefas: [t(1, { arquivos: ['a', 'b', 'c', 'd'] })], gates: GATES }), /no máximo 3 arquivos/);
});

test('P com mais de 5 critérios é erro', () => {
  assert.match(
    erros({ tarefas: [t(1, { aceite: ['1', '2', '3', '4', '5', '6'] })], gates: GATES }),
    /no máximo 5 critérios/,
  );
});

test('M pode ser maior que o limite do P', () => {
  assert.ok(checar({ tarefas: [t(1, { tamanho: 'M', arquivos: ['a', 'b', 'c', 'd'] })], gates: GATES }).ok);
});

test('glob em arquivos é erro', () => {
  assert.match(erros({ tarefas: [t(1, { arquivos: ['src/*.js'] })], gates: GATES }), /glob/);
});

test('gates ausentes são erro', () => {
  const e = erros({ tarefas: [t(1)] });
  assert.match(e, /gates\.tarefa/);
  assert.match(e, /gates\.onda/);
});

test('tarefas vazias são erro', () => {
  assert.match(erros({ tarefas: [], gates: GATES }), /lista vazia/);
});

test('campos obrigatórios faltando são erro', () => {
  const e = erros({ tarefas: [{ id: 1 }], gates: GATES });
  assert.match(e, /titulo/);
  assert.match(e, /tamanho/);
  assert.match(e, /aceite/);
});

test('gate da tarefa recebe os arquivos entre aspas simples', () => {
  const r = checar({ tarefas: [t(1, { arquivos: ['src/a b.js', "src/it's.js"] })], gates: GATES });
  assert.equal(r.saida.tarefas[0].gate, `lint 'src/a b.js' 'src/it'\\''s.js'`);
});

test('gate de tarefa sem arquivos fica sem a lista', () => {
  const r = checar({ tarefas: [t(1, { arquivos: undefined })], gates: GATES });
  assert.equal(r.saida.tarefas[0].gate, 'lint ');
});

test('CLI: sucesso imprime JSON com ondas', () => {
  const r = spawnSync(process.execPath, [CLI], {
    input: JSON.stringify({ tarefas: [t(1)], gates: GATES }), encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).ondas, [[1]]);
});

test('CLI: JSON inválido sai com 1', () => {
  const r = spawnSync(process.execPath, [CLI], { input: '{', encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /JSON inválido/);
});

test('CLI: spec inválida lista os erros e sai com 1', () => {
  const r = spawnSync(process.execPath, [CLI], {
    input: JSON.stringify({ tarefas: [t(1, { depende: [9] })], gates: GATES }), encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^- tarefa 1: depende de id inexistente \(9\)/m);
});

test('titulo com quebra de linha é erro (vira mensagem de commit)', () => {
  assert.match(erros({ tarefas: [t(1, { titulo: 'linha 1\nlinha 2' })], gates: GATES }), /titulo deve ter uma linha/);
});
