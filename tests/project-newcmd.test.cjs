'use strict';
// newProjectCommand escolhe o script de criação de projeto por plataforma.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { newProjectCommand } = require('../lib/project-json.cjs');

const ROOT = path.join(__dirname, '..');

test('win32 usa powershell.exe com windows/new-project.ps1', () => {
  const c = newProjectCommand('win32', ROOT, 'meu-app', 'C:\\work\\meu-app');
  assert.equal(c.cmd, 'powershell.exe');
  assert.deepEqual(c.args, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(ROOT, 'windows', 'new-project.ps1'), 'meu-app', 'C:\\work\\meu-app',
  ]);
});

for (const platform of ['linux', 'darwin']) {
  test(`${platform} usa new-project.sh com nome e pasta`, () => {
    const c = newProjectCommand(platform, ROOT, 'meu-app', '/home/x/meu-app');
    assert.equal(c.cmd, path.join(ROOT, 'new-project.sh'));
    assert.deepEqual(c.args, ['meu-app', '/home/x/meu-app']);
  });
}
