import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularResumo, formatarTempo, formatarPercentual } from '../../src/core/metrics.js';

test('formatarTempo usa mm:ss', () => {
  assert.equal(formatarTempo(0), '00:00');
  assert.equal(formatarTempo(65_000), '01:05');
  assert.equal(formatarTempo(3_600_000), '60:00');
  assert.equal(formatarTempo(-10), '00:00');
});

test('formatarPercentual usa virgula e some com as casas zeradas', () => {
  assert.equal(formatarPercentual(83.333), '83,33%');
  assert.equal(formatarPercentual(100), '100%');
  assert.equal(formatarPercentual(0), '0%');
});

test('o exemplo da especificacao: minimo 10, jogador 12', () => {
  const resumo = calcularResumo({
    palitosRemovidos: 12, minimo: 10, iniciadoEm: 0, finalizadoEm: 90_000,
  });
  assert.equal(resumo.excedentes, 2);
  assert.equal(Number(resumo.eficiencia.toFixed(2)), 83.33);
  assert.equal(resumo.tempoFormatado, '01:30');
});

test('eficiencia de 100% quando o jogador iguala o minimo', () => {
  const resumo = calcularResumo({ palitosRemovidos: 10, minimo: 10, iniciadoEm: 0, finalizadoEm: 0 });
  assert.equal(resumo.eficiencia, 100);
  assert.equal(resumo.excedentes, 0);
});

test('sem remocoes a eficiencia e zero, sem divisao por zero', () => {
  const resumo = calcularResumo({ palitosRemovidos: 0, minimo: 10, iniciadoEm: 0, finalizadoEm: 0 });
  assert.equal(resumo.eficiencia, 0);
});

test('sem referencia disponivel, minimo e excedentes ficam nulos', () => {
  const resumo = calcularResumo({ palitosRemovidos: 5, minimo: null, iniciadoEm: 0, finalizadoEm: 1000 });
  assert.equal(resumo.minimo, null);
  assert.equal(resumo.excedentes, null);
  assert.equal(resumo.eficiencia, 0);
});

test('partida em andamento mede o tempo ate agora', () => {
  const resumo = calcularResumo({
    palitosRemovidos: 3, minimo: 10, iniciadoEm: 1000, finalizadoEm: null, agora: 31_000,
  });
  assert.equal(resumo.tempoFormatado, '00:30');
});
