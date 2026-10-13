const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('../src/slug');

test('minúsculas e hífens', () => assert.equal(slugify('Camiseta Azul'), 'camiseta-azul'));
test('remove acentos', () => assert.equal(slugify('Ação Única'), 'acao-unica'));
test('colapsa separadores e apara as pontas', () => assert.equal(slugify('  Olá,   Mundo!! '), 'ola-mundo'));
test('texto vazio', () => assert.equal(slugify(''), ''));
