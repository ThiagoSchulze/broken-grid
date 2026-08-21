import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ErroDataset, validarDataset, carregarDataset, escolherGrade, configDaGrade,
} from '../../src/dataset/loader.js';

function datasetValido() {
  return {
    schemaVersion: 1,
    n: 4,
    geradoEm: '2026-08-19',
    seed: 1,
    grids: [
      {
        id: 'g4-001',
        quebrados: ['h:0:1'],
        bloqueados: ['v:2:2'],
        dificuldade: 'medio',
        referencia: { palitos: ['h:0:0', 'v:1:1'], quantidade: 2, proven: false },
      },
      {
        id: 'g4-002',
        quebrados: [],
        bloqueados: [],
        dificuldade: 'facil',
        referencia: { palitos: ['h:1:1'], quantidade: 1, proven: false },
      },
    ],
  };
}

test('um dataset bem formado passa na validacao', () => {
  assert.doesNotThrow(() => validarDataset(datasetValido()));
});

test('rejeita versao de schema desconhecida', () => {
  const d = datasetValido();
  d.schemaVersion = 2;
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita tamanho de grade fora de 4 a 7', () => {
  const d = datasetValido();
  d.n = 3;
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita id ausente ou duplicado', () => {
  const semId = datasetValido();
  delete semId.grids[0].id;
  assert.throws(() => validarDataset(semId), ErroDataset);

  const duplicado = datasetValido();
  duplicado.grids[1].id = 'g4-001';
  assert.throws(() => validarDataset(duplicado), ErroDataset);
});

test('rejeita palito com formato ou coordenada invalida', () => {
  const d = datasetValido();
  d.grids[0].quebrados = ['h:9:9'];
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita palito quebrado e bloqueado ao mesmo tempo', () => {
  const d = datasetValido();
  d.grids[0].bloqueados = ['h:0:1'];
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita referencia que contem palito quebrado ou bloqueado', () => {
  const comQuebrado = datasetValido();
  comQuebrado.grids[0].referencia.palitos = ['h:0:1', 'v:1:1'];
  assert.throws(() => validarDataset(comQuebrado), ErroDataset);

  const comBloqueado = datasetValido();
  comBloqueado.grids[0].referencia.palitos = ['v:2:2', 'v:1:1'];
  assert.throws(() => validarDataset(comBloqueado), ErroDataset);
});

test('rejeita quantidade incoerente com a lista da referencia', () => {
  const d = datasetValido();
  d.grids[0].referencia.quantidade = 99;
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('rejeita dataset sem nenhuma grade', () => {
  const d = datasetValido();
  d.grids = [];
  assert.throws(() => validarDataset(d), ErroDataset);
});

test('carregarDataset busca, faz o parse e valida', async () => {
  const buscar = async (url) => {
    assert.equal(url, 'data/grids/4x4.json');
    return { ok: true, text: async () => JSON.stringify(datasetValido()) };
  };
  const dataset = await carregarDataset(4, { buscar });
  assert.equal(dataset.grids.length, 2);
});

test('carregarDataset falha com mensagem clara em HTTP ruim ou JSON quebrado', async () => {
  await assert.rejects(
    () => carregarDataset(4, { buscar: async () => ({ ok: false, status: 404 }) }),
    ErroDataset,
  );
  await assert.rejects(
    () => carregarDataset(4, { buscar: async () => ({ ok: true, text: async () => '{ nao e json' }) }),
    ErroDataset,
  );
});

test('escolherGrade evita repetir a grade atual', () => {
  const dataset = validarDataset(datasetValido());
  for (let i = 0; i < 20; i += 1) {
    const grid = escolherGrade(dataset, { exceto: 'g4-001' });
    assert.equal(grid.id, 'g4-002');
  }
});

test('escolherGrade com uma unica grade devolve a propria', () => {
  const dataset = validarDataset(datasetValido());
  dataset.grids.pop();
  assert.equal(escolherGrade(dataset, { exceto: 'g4-001' }).id, 'g4-001');
});

test('configDaGrade monta a config que o motor consome', () => {
  const dataset = validarDataset(datasetValido());
  const config = configDaGrade(dataset, dataset.grids[0]);
  assert.deepEqual(config, {
    id: 'g4-001',
    n: 4,
    quebrados: ['h:0:1'],
    bloqueados: ['v:2:2'],
    referencia: { palitos: ['h:0:0', 'v:1:1'], quantidade: 2, proven: false },
  });
});
