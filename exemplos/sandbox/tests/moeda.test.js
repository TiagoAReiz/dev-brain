const test = require('node:test');
const assert = require('node:assert/strict');
const { formatarBRL } = require('../src/moeda');

test('milhar e centavos', () => assert.equal(formatarBRL(123456), 'R$ 1.234,56'));
test('zero', () => assert.equal(formatarBRL(0), 'R$ 0,00'));
test('negativo com sinal antes do símbolo', () => assert.equal(formatarBRL(-1000), '-R$ 10,00'));
test('espaço comum, não NBSP', () => assert.ok(!formatarBRL(100).includes(' ')));
test('rejeita centavos não inteiros', () => assert.throws(() => formatarBRL(1.5), TypeError));
