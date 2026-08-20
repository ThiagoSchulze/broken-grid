import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, estaPresente, motivoRecusa } from '../../src/core/rules.js';
import { ErroGrade, montarGrade, registrarAusencia, registrarPresenca } from '../../src/core/grid.js';

test('bloqueado conta como presente; quebrado e removido nao', () => {
  assert.ok(estaPresente(ESTADOS.REMOVIVEL));
  assert.ok(estaPresente(ESTADOS.BLOQUEADO));
  assert.ok(!estaPresente(ESTADOS.QUEBRADO));
  assert.ok(!estaPresente(ESTADOS.REMOVIDO));
});

test('motivoRecusa devolve null so para removivel', () => {
  assert.equal(motivoRecusa(ESTADOS.REMOVIVEL), null);
  assert.equal(motivoRecusa(ESTADOS.BLOQUEADO), 'bloqueado');
  assert.equal(motivoRecusa(ESTADOS.QUEBRADO), 'quebrado');
  assert.equal(motivoRecusa(ESTADOS.REMOVIDO), 'ja-removido');
  assert.equal(motivoRecusa(undefined), 'inexistente');
});

test('grade limpa 4x4 tem 40 palitos e 30 quadrados vivos', () => {
  const grade = montarGrade({ n: 4 });
  assert.equal(grade.palitos.size, 40);
  assert.equal(grade.quadrados.length, 30);
  assert.equal(grade.quadradosVivos, 30);
});

test('palito quebrado ja nasce matando os quadrados que dependem dele', () => {
  // h:0:0 e borda de 4 quadrados: os de tamanho 1, 2, 3 e 4 ancorados em (0,0)
  const grade = montarGrade({ n: 4, quebrados: ['h:0:0'] });
  assert.equal(grade.palitos.get('h:0:0'), ESTADOS.QUEBRADO);
  assert.equal(grade.quadradosVivos, 26);
});

test('palito bloqueado nao mata quadrado nenhum', () => {
  const grade = montarGrade({ n: 4, bloqueados: ['h:0:0'] });
  assert.equal(grade.palitos.get('h:0:0'), ESTADOS.BLOQUEADO);
  assert.equal(grade.quadradosVivos, 30);
});

test('o indice reverso liga cada palito aos quadrados que ele afeta', () => {
  const grade = montarGrade({ n: 4 });
  assert.equal(grade.indice.get('h:0:0').length, 4);
  for (const i of grade.indice.get('h:0:0')) {
    assert.ok(grade.quadrados[i].bordas.includes('h:0:0'));
  }
});

test('registrarAusencia e registrarPresenca sao simetricos', () => {
  const grade = montarGrade({ n: 4 });
  registrarAusencia(grade, 'v:1:1');
  const depoisDaAusencia = grade.quadradosVivos;
  assert.ok(depoisDaAusencia < 30);
  registrarPresenca(grade, 'v:1:1');
  assert.equal(grade.quadradosVivos, 30);
});

test('dois palitos ausentes no mesmo quadrado descontam o quadrado uma vez so', () => {
  const grade = montarGrade({ n: 4 });
  const antes = grade.quadradosVivos;
  registrarAusencia(grade, 'h:0:0');
  const depoisDoPrimeiro = grade.quadradosVivos;
  registrarAusencia(grade, 'h:1:0'); // outra borda do mesmo 1x1
  registrarPresenca(grade, 'h:1:0');
  assert.equal(grade.quadradosVivos, depoisDoPrimeiro);
  registrarPresenca(grade, 'h:0:0');
  assert.equal(grade.quadradosVivos, antes);
});

test('montarGrade rejeita configuracao invalida', () => {
  assert.throws(() => montarGrade({ n: 3 }), ErroGrade);
  assert.throws(() => montarGrade({ n: 4, quebrados: ['h:9:9'] }), ErroGrade);
  assert.throws(() => montarGrade({ n: 4, quebrados: ['h:0:0'], bloqueados: ['h:0:0'] }), ErroGrade);
  assert.throws(() => montarGrade({ n: 4, quebrados: ['h:0:0', 'h:0:0'] }), ErroGrade);
});
