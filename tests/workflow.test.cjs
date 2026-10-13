'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'global', 'workflows', 'time.js');
const fonte = () => fs.readFileSync(SCRIPT, 'utf8');

test('time.js tem sintaxe válida de módulo', () => {
  // O Workflow aceita `return` no corpo do script; o Node não. Troca só para checar a sintaxe.
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'time-')), 'time.mjs');
  const corpo = fonte();
  assert.ok(corpo.includes('\nreturn {'), 'o script deve terminar com return {...}');
  fs.writeFileSync(tmp, corpo.replace('\nreturn {', '\nexport default {'));
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('time.js começa com meta literal', () => {
  assert.match(fonte(), /^export const meta = \{\n {2}name: 'time-de-agentes',/);
});

test('time.js não usa relógio nem aleatório', () => {
  assert.doesNotMatch(fonte(), /Date\.now\(|Math\.random\(|new Date\(/);
});

test('todo agentType usado existe em global/agents', () => {
  const tipos = [...fonte().matchAll(/agentType: '([a-z-]+)'/g)].map((m) => m[1]);
  const usados = new Set([...tipos, 'dev-rapido', 'dev']);
  for (const tipo of usados) {
    assert.ok(fs.existsSync(path.join(RAIZ, 'global', 'agents', `${tipo}.md`)), `agente inexistente: ${tipo}`);
  }
});
