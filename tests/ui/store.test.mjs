import test from 'node:test';
import assert from 'node:assert/strict';
import { criarStore } from '../../src/ui/store.js';

test('obter devolve o estado inicial congelado', () => {
  const store = criarStore({ vista: 'jogo' });
  assert.equal(store.obter().vista, 'jogo');
  assert.ok(Object.isFrozen(store.obter()));
});

test('atualizar faz merge parcial e notifica os inscritos', () => {
  const store = criarStore({ vista: 'jogo', solucao: null });
  const recebidos = [];
  store.inscrever((estado) => recebidos.push(estado.vista));
  store.atualizar({ vista: 'solucao' });
  assert.equal(store.obter().vista, 'solucao');
  assert.equal(store.obter().solucao, null, 'campos nao citados permanecem');
  assert.deepEqual(recebidos, ['solucao']);
});

test('o cancelamento para de notificar', () => {
  const store = criarStore({ vista: 'jogo' });
  const recebidos = [];
  const cancelar = store.inscrever((estado) => recebidos.push(estado.vista));
  store.atualizar({ vista: 'solucao' });
  cancelar();
  store.atualizar({ vista: 'desempenho' });
  assert.deepEqual(recebidos, ['solucao']);
});
