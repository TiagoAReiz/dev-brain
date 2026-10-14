'use strict';
// A skill delegar-codex precisa cobrir o contrato do comando codex-agente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const skill = fs.readFileSync(path.join(RAIZ, 'global', 'skills', 'delegar-codex', 'SKILL.md'), 'utf8');

// Frontmatter entre as duas primeiras linhas '---'.
function frontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const campos = {};
  for (const linha of m[1].split('\n')) {
    const i = linha.indexOf(':');
    if (i > 0) campos[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return campos;
}

test('frontmatter tem name e description', () => {
  const fm = frontmatter(skill);
  assert.ok(fm, 'frontmatter ausente');
  assert.equal(fm.name, 'delegar-codex');
  assert.ok(fm.description && fm.description.length > 0, 'description vazia');
});

test('a description cita Codex, delegar, outra assinatura e distribuir carga', () => {
  const { description } = frontmatter(skill);
  for (const termo of ['Codex', 'delegar', 'outra assinatura', 'distribuir carga']) {
    assert.ok(description.includes(termo), `description não cita "${termo}"`);
  }
});

test('toda flag do contrato aparece no texto', () => {
  for (const flag of ['--repo', '--escrever', '--timeout', '--modelo', '--codex-home']) {
    assert.ok(skill.includes(flag), `skill não cita ${flag}`);
  }
});

test('todo status do contrato aparece no texto', () => {
  for (const status of ['ok', 'erro', 'timeout', 'indisponivel', 'uso']) {
    assert.ok(skill.includes(`\`${status}\``), `skill não trata o status ${status}`);
  }
});

test('a skill não oferece danger-full-access como opção', () => {
  assert.ok(!skill.includes('danger-full-access'), 'skill menciona danger-full-access');
  assert.ok(!skill.includes('--dangerously'), 'skill menciona --dangerously');
});

test('a skill tem as 5 partes exigidas', () => {
  for (const titulo of [
    'Quando delegar',
    'Como chamar',
    'O prompt precisa ser autocontido',
    'Ler o resultado',
    'Regras de segurança',
  ]) {
    assert.ok(skill.includes(titulo), `falta a seção "${titulo}"`);
  }
});

test('a skill mostra exemplo real do comando com --repo, --escrever, --timeout e --codex-home', () => {
  assert.ok(/codex-agente --repo \S+ --escrever --timeout \d+ --codex-home \S+/.test(skill));
});
