const test = require('node:test');
const assert = require('node:assert/strict');
const { urlProduto } = require('../src/url-produto');

test('monta a url com slug e id', () => assert.equal(urlProduto('Camiseta Azul', 42), '/p/camiseta-azul-42'));
test('id precisa ser inteiro positivo', () => assert.throws(() => urlProduto('x', 0), RangeError));
