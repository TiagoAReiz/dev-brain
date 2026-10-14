'use strict';
// samePath e homeDir: comparação de caminhos e HOME compatíveis com Windows.
const test = require('node:test');
const assert = require('node:assert/strict');
const { samePath, homeDir } = require('../lib/project-json.cjs');

test('win32: barras / e \\ equivalem', () => {
  assert.equal(samePath('C:/a/b', 'C:\\a\\b', 'win32'), true);
});
test('win32: ignora caixa', () => {
  assert.equal(samePath('C:\\Users\\Tiago\\Work', 'c:/users/tiago/work', 'win32'), true);
});
test('win32: ignora barra final', () => {
  assert.equal(samePath('C:\\a\\b\\', 'C:/a/b', 'win32'), true);
});
test('win32: caminhos diferentes não batem', () => {
  assert.equal(samePath('C:/a/b', 'C:/a/c', 'win32'), false);
});
test('linux: exato, diferencia caixa', () => {
  assert.equal(samePath('/a/b', '/a/B', 'linux'), false);
  assert.equal(samePath('/a/b', '/a/b', 'linux'), true);
});
test('linux: ignora barra final mas não troca barra invertida', () => {
  assert.equal(samePath('/a/b/', '/a/b', 'linux'), true);
  assert.equal(samePath('/a/b', '/a\\b', 'linux'), false);
});
test('homeDir: HOME tem prioridade', () => {
  assert.equal(homeDir({ HOME: '/h', USERPROFILE: 'C:\\u' }), '/h');
});
test('homeDir: sem HOME usa USERPROFILE', () => {
  assert.equal(homeDir({ USERPROFILE: 'C:\\u' }), 'C:\\u');
});
test('homeDir: sem nada usa os.homedir()', () => {
  assert.equal(homeDir({}), require('node:os').homedir());
});
