'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'global', 'agents');
const ESPERADOS = {
  'dev-rapido': 'haiku', dev: 'sonnet', gate: 'haiku', commit: 'haiku', revisor: 'sonnet', 'qa-browser': 'sonnet',
};

function frontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'sem frontmatter');
  return Object.fromEntries(m[1].split('\n').map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
}

for (const [nome, modelo] of Object.entries(ESPERADOS)) {
  test(`agente ${nome}`, () => {
    const texto = fs.readFileSync(path.join(DIR, `${nome}.md`), 'utf8');
    const fm = frontmatter(texto);
    assert.equal(fm.name, nome);
    assert.equal(fm.model, modelo);
    assert.ok(fm.description && fm.description.length > 20, 'description curta demais');
    assert.ok(texto.split('---\n').slice(2).join('---\n').trim().length > 100, 'corpo vazio');
  });
}

test('nenhum agente sobrando', () => {
  const achados = fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(achados, Object.keys(ESPERADOS).sort());
});

test('commit usa heredoc com aspas na mensagem (sem expansão de shell)', () => {
  const texto = fs.readFileSync(path.join(DIR, 'commit.md'), 'utf8');
  assert.match(texto, /commit -F - <<'MSG'/);
  assert.doesNotMatch(texto, /commit -m "/);
});
