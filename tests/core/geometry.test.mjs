import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idPalito, analisarId, palitoValido, listarPalitos, listarQuadrados, bordasDoQuadrado
} from '../../src/core/geometry.js';

test('idPalito e analisarId sao inversos', () => {
  assert.equal(idPalito('h', 0, 2), 'h:0:2');
  assert.deepEqual(analisarId('v:3:1'), { orientacao: 'v', linha: 3, coluna: 1 });
});

test('analisarId rejeita entradas malformadas', () => {
  // 'h:00:1' e 'h:0:1' sao o mesmo palito: aceitar os dois criaria duas
  // chaves distintas no Map da grade.
  for (const ruim of ['x:0:0', 'h:0', 'h:-1:0', 'h:a:0', '', 'h:0:0:0', null, 'h:00:1', 'v:1:01']) {
    assert.equal(analisarId(ruim), null, `deveria rejeitar ${ruim}`);
  }
});

test('palitoValido respeita os limites da grade', () => {
  assert.ok(palitoValido('h:4:3', 4));   // ultima linha horizontal
  assert.ok(palitoValido('v:3:4', 4));   // ultima coluna vertical
  assert.ok(!palitoValido('h:5:0', 4));
  assert.ok(!palitoValido('h:0:4', 4));
  assert.ok(!palitoValido('v:4:0', 4));
  assert.ok(!palitoValido('v:0:5', 4));
});

test('listarPalitos devolve 2*n*(n+1) ids distintos', () => {
  for (const n of [4, 5, 6, 7]) {
    const palitos = listarPalitos(n);
    assert.equal(palitos.length, 2 * n * (n + 1));
    assert.equal(new Set(palitos).size, palitos.length);
    for (const id of palitos) assert.ok(palitoValido(id, n), `${id} fora da grade ${n}`);
  }
});

test('listarQuadrados devolve a soma dos quadrados perfeitos', () => {
  assert.equal(listarQuadrados(4).length, 30);   // 16+9+4+1
  assert.equal(listarQuadrados(5).length, 55);   // 25+16+9+4+1
  assert.equal(listarQuadrados(7).length, 140);  // 49+36+25+16+9+4+1
});

test('um quadrado de tamanho k tem 4k bordas distintas e dentro da grade', () => {
  const n = 5;
  const validos = new Set(listarPalitos(n));
  for (const q of listarQuadrados(n)) {
    assert.equal(q.bordas.length, 4 * q.tamanho, `quadrado ${q.tamanho} em ${q.linha},${q.coluna}`);
    assert.equal(new Set(q.bordas).size, q.bordas.length);
    for (const b of q.bordas) assert.ok(validos.has(b), `borda ${b} fora da grade`);
  }
});

test('bordasDoQuadrado do 1x1 no canto superior esquerdo', () => {
  assert.deepEqual(
    [...bordasDoQuadrado(1, 0, 0)].sort(),
    ['h:0:0', 'h:1:0', 'v:0:0', 'v:0:1'].sort()
  );
});

test('bordasDoQuadrado do 2x2 na origem cobre topo, base e laterais', () => {
  assert.deepEqual(
    [...bordasDoQuadrado(2, 0, 0)].sort(),
    ['h:0:0', 'h:0:1', 'h:2:0', 'h:2:1', 'v:0:0', 'v:1:0', 'v:0:2', 'v:1:2'].sort()
  );
});
