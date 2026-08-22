import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { validarDataset, configDaGrade } from '../../src/dataset/loader.js';
import { montarGrade, registrarAusencia } from '../../src/core/grid.js';
import { TAMANHOS_SUPORTADOS } from '../../src/core/grid.js';
import { ESTADOS } from '../../src/core/rules.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function lerDataset(n) {
  const texto = await readFile(resolve(RAIZ, 'data', 'grids', `${n}x${n}.json`), 'utf8');
  return validarDataset(JSON.parse(texto));
}

/**
 * Os testes de tools/ validam grades geradas na hora. Estes validam os arquivos
 * COMMITADOS — uma edicao manual num JSON deixaria a suite verde sem isso.
 */
for (const n of TAMANHOS_SUPORTADOS) {
  test(`data/grids/${n}x${n}.json passa pela validacao de schema`, async () => {
    const dataset = await lerDataset(n);
    assert.equal(dataset.n, n);
    assert.equal(dataset.grids.length, 20, '20 grades por tamanho, conforme a spec 6.3');
  });

  test(`toda grade de ${n}x${n} e solucionavel pela referencia gravada`, async () => {
    const dataset = await lerDataset(n);

    for (const grid of dataset.grids) {
      const config = configDaGrade(dataset, grid);
      const grade = montarGrade(config);

      // RN04: a referencia so pode usar palitos que o jogador poderia remover.
      for (const id of config.referencia.palitos) {
        assert.equal(
          grade.palitos.get(id), ESTADOS.REMOVIVEL,
          `${grid.id}: referencia usa ${id}, que nao esta removivel`,
        );
      }

      for (const id of config.referencia.palitos) registrarAusencia(grade, id);

      // RN05: aplicar a referencia inteira nao pode deixar quadrado vivo.
      assert.equal(
        grade.quadradosVivos, 0,
        `${grid.id}: sobraram ${grade.quadradosVivos} quadrados apos a referencia`,
      );
      assert.equal(config.referencia.quantidade, config.referencia.palitos.length);
    }
  });
}
