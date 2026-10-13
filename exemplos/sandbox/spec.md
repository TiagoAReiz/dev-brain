# Utilitários de catálogo

**Status:** planejada
**Data:** 2026-10-13
**Projeto:** sandbox

## Objetivo
Três funções puras para o catálogo: slug de texto, formatação de reais e URL de produto.

## Contexto
`src/` está vazio. Os testes de aceite já estão em `tests/` e são a definição de pronto.

## Decisões
- Sem dependências: só JavaScript e módulos nativos do Node.

## Fora de escopo
- Alterar qualquer arquivo em `tests/`.

## Padrões a seguir
- CommonJS: `module.exports = { nomeDaFuncao }`. Um módulo por arquivo.

## Contratos
- `slugify(texto: string): string`: minúsculas, sem acento, só `[a-z0-9]` separados por um hífen, sem hífen nas pontas.
- `formatarBRL(centavos: number): string`: `"R$ 1.234,56"`, `"-R$ 10,00"` para negativos, espaço comum (U+0020);
  `TypeError` se `centavos` não for inteiro.
- `urlProduto(nome: string, id: number): string`: `"/p/<slugify(nome)>-<id>"`; `RangeError` se `id` não for inteiro positivo.

## Tarefas
```yaml
- id: 1
  titulo: slugify
  tamanho: P
  arquivos: [src/slug.js]
  depende: []
  aceite:
    - tests/slug.test.js passa
- id: 2
  titulo: formatarBRL
  tamanho: P
  arquivos: [src/moeda.js]
  depende: []
  aceite:
    - tests/moeda.test.js passa
    - negativo sai como "-R$ 10,00" e o espaço é U+0020, não NBSP
- id: 3
  titulo: urlProduto
  tamanho: P
  arquivos: [src/url-produto.js]
  depende: [1]
  referencia: src/slug.js
  aceite:
    - tests/url-produto.test.js passa
    - reaproveita slugify de src/slug.js
```

## Como ficou
