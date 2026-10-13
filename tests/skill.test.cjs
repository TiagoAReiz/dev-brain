'use strict';
// A skill implementar precisa orientar todo resultado que o time.js produz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const timeJs = fs.readFileSync(path.join(RAIZ, 'global', 'workflows', 'time.js'), 'utf8');
const skill = fs.readFileSync(path.join(RAIZ, 'global', 'skills', 'implementar', 'SKILL.md'), 'utf8');

test('a skill trata todo motivo de bloqueio do time.js', () => {
  const motivos = new Set([
    ...[...timeJs.matchAll(/bloquear\(t, '([a-z_]+)'/g)].map((m) => m[1]),
    ...[...timeJs.matchAll(/escadaSegura\([^)]*'([a-z_]+)'\)/g)].map((m) => m[1]),
  ]);
  assert.ok(motivos.size >= 5, `poucos motivos achados: ${[...motivos]}`);
  for (const m of motivos) assert.ok(skill.includes(`\`${m}\``), `skill não trata o motivo ${m}`);
});

test('a skill trata tarefas puladas e o gate pós-revisão', () => {
  assert.ok(skill.includes('`pulada`'));
  assert.ok(skill.includes('`gate_pos_revisao`'));
});
