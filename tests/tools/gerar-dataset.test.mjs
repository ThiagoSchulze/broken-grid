import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRng, gerarGrade, gerarDataset } from '../../tools/gerar-dataset.mjs';
import { montarGrade, registrarAusencia } from '../../src/core/grid.js';
import { ESTADOS } from '../../src/core/rules.js';

test('o mesmo seed produz o mesmo dataset', () => {
  const a = gerarDataset(4, { seed: 42, quantidade: 3 });
  const b = gerarDataset(4, { seed: 42, quantidade: 3 });
  assert.deepEqual(a, b);
});

test('seeds diferentes produzem grades diferentes', () => {
  const a = gerarDataset(4, { seed: 1, quantidade: 3 });
  const b = gerarDataset(4, { seed: 2, quantidade: 3 });
  assert.notDeepEqual(a.grids, b.grids);
});

test('RN04 e RN05: todo quadrado vivo tem ao menos um lado removivel', () => {
  for (const n of [4, 5, 6, 7]) {
    const rng = criarRng(7 + n);
    for (let i = 0; i < 15; i += 1) {
      const config = gerarGrade(n, rng);
      const grade = montarGrade(config);
      for (const quadrado of grade.quadrados) {
        if (quadrado.ausentes > 0) continue;
        const removiveis = quadrado.bordas.filter((b) => grade.palitos.get(b) === ESTADOS.REMOVIVEL);
        assert.ok(removiveis.length > 0, `quadrado sem lado removivel na grade ${n}`);
      }
    }
  }
});

test('a referencia elimina de fato todos os quadrados vivos', () => {
  for (const n of [4, 5, 6, 7]) {
    const rng = criarRng(100 + n);
    for (let i = 0; i < 15; i += 1) {
      const config = gerarGrade(n, rng);
      const grade = montarGrade(config);
      for (const id of config.referencia.palitos) registrarAusencia(grade, id);
      assert.equal(grade.quadradosVivos, 0, `referencia insuficiente na grade ${n}`);
    }
  }
});

test('a referencia e irredutivel: tirar qualquer palito dela deixa quadrado vivo', () => {
  const rng = criarRng(2024);
  for (let i = 0; i < 10; i += 1) {
    const config = gerarGrade(4, rng);
    for (const excluido of config.referencia.palitos) {
      const grade = montarGrade(config);
      for (const id of config.referencia.palitos) {
        if (id !== excluido) registrarAusencia(grade, id);
      }
      assert.ok(grade.quadradosVivos > 0, `${excluido} era redundante na referencia`);
    }
  }
});

test('a referencia nunca contem palito quebrado ou bloqueado', () => {
  const rng = criarRng(555);
  for (let i = 0; i < 20; i += 1) {
    const config = gerarGrade(6, rng);
    for (const id of config.referencia.palitos) {
      assert.ok(!config.quebrados.includes(id), `${id} quebrado dentro da referencia`);
      assert.ok(!config.bloqueados.includes(id), `${id} bloqueado dentro da referencia`);
    }
    assert.equal(config.referencia.quantidade, config.referencia.palitos.length);
    assert.equal(config.referencia.proven, false);
  }
});

test('gerarDataset respeita o schema e da id unico a cada grade', () => {
  const dataset = gerarDataset(5, { seed: 9, quantidade: 6 });
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(dataset.n, 5);
  assert.equal(dataset.seed, 9);
  assert.equal(dataset.grids.length, 6);
  assert.equal(new Set(dataset.grids.map((g) => g.id)).size, 6);
  for (const grid of dataset.grids) {
    assert.match(grid.id, /^g5-\d{3}$/);
    assert.ok(['facil', 'medio', 'dificil'].includes(grid.dificuldade));
  }
});

test('grades triviais sao descartadas: toda grade comeca com quadrados vivos suficientes', () => {
  const rng = criarRng(31);
  for (let i = 0; i < 20; i += 1) {
    const config = gerarGrade(4, rng);
    const grade = montarGrade(config);
    assert.ok(grade.quadradosVivos >= 4, `grade trivial com ${grade.quadradosVivos} vivos`);
  }
});
