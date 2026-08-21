import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularLayout, coordenadasDoPalito } from '../../src/ui/layout.js';

test('o layout cresce com n e reserva margem nos dois lados', () => {
  const layout = calcularLayout(4, { margem: 20, passo: 80 });
  assert.equal(layout.largura, 20 * 2 + 4 * 80);
  assert.equal(layout.altura, layout.largura);
});

test('um palito horizontal vai da coluna c ate c+1 na mesma linha', () => {
  const layout = calcularLayout(4, { margem: 20, passo: 80 });
  assert.deepEqual(coordenadasDoPalito('h:1:2', layout), {
    x1: 20 + 2 * 80, y1: 20 + 1 * 80, x2: 20 + 3 * 80, y2: 20 + 1 * 80,
  });
});

test('um palito vertical vai da linha r ate r+1 na mesma coluna', () => {
  const layout = calcularLayout(4, { margem: 20, passo: 80 });
  assert.deepEqual(coordenadasDoPalito('v:1:2', layout), {
    x1: 20 + 2 * 80, y1: 20 + 1 * 80, x2: 20 + 2 * 80, y2: 20 + 2 * 80,
  });
});

test('todo palito da grade cabe dentro do viewBox', () => {
  const layout = calcularLayout(7);
  for (const id of ['h:0:0', 'h:7:6', 'v:0:0', 'v:6:7']) {
    const { x1, y1, x2, y2 } = coordenadasDoPalito(id, layout);
    for (const v of [x1, x2]) assert.ok(v >= 0 && v <= layout.largura, `${id} fora em x`);
    for (const v of [y1, y2]) assert.ok(v >= 0 && v <= layout.altura, `${id} fora em y`);
  }
});

test('id invalido devolve null em vez de coordenadas erradas', () => {
  assert.equal(coordenadasDoPalito('x:1:1', calcularLayout(4)), null);
});
