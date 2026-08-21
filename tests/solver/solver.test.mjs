import test from 'node:test';
import assert from 'node:assert/strict';
import { resolver, ErroSolver } from '../../src/solver/index.js';

const config = {
  id: 'g4-001',
  n: 4,
  quebrados: [],
  bloqueados: [],
  referencia: { palitos: ['h:0:0', 'v:1:1'], quantidade: 2, proven: false },
};

test('o solver devolve a referencia do dataset, marcada como nao comprovada', async () => {
  const resultado = await resolver(config);
  assert.deepEqual(resultado.palitos, ['h:0:0', 'v:1:1']);
  assert.equal(resultado.quantidade, 2);
  assert.equal(resultado.proven, false);
  assert.equal(resultado.origem, 'dataset');
  assert.equal(typeof resultado.tempoMs, 'number');
});

test('o solver devolve copia: mexer no resultado nao altera a config', async () => {
  const resultado = await resolver(config);
  resultado.palitos.push('h:3:3');
  assert.equal(config.referencia.palitos.length, 2);
});

test('grade sem referencia produz ErroSolver com mensagem clara', async () => {
  await assert.rejects(() => resolver({ id: 'g4-002', n: 4 }), ErroSolver);
});
