// Uso: node tools/verificar-interface.mjs

import { criarPartida, estadoInicial } from '../src/core/engine.js';
import { ESTADOS } from '../src/core/rules.js';

let total = 0;
let falhas = 0;

function checar(nome, condicao, detalhe = '') {
  total += 1;
  if (condicao) {
    console.log(`  ok    ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? `: ${detalhe}` : ''}`);
  }
}

function secao(titulo) {
  console.log(`\n== ${titulo}`);
}

function todosOsHorizontais(n) {
  const ids = [];
  for (let linha = 0; linha <= n; linha += 1) {
    for (let coluna = 0; coluna < n; coluna += 1) ids.push(`h:${linha}:${coluna}`);
  }
  return ids;
}

async function principal() {
  verificarEstadoInicial();

  console.log(`\n${total - falhas}/${total} verificacoes passaram`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

function verificarEstadoInicial() {
  secao('estadoInicial');

  const limpa = { id: 'limpa-4', n: 4, quebrados: [], bloqueados: [] };
  const estado = estadoInicial(limpa);

  checar('nenhum palito removido', estado.palitosRemovidos === 0);
  checar('historico vazio', estado.historico.length === 0);
  checar('nao da para desfazer', estado.podeDesfazer === false);
  checar('sem relogio de inicio', estado.iniciadoEm === null);
  checar('sem relogio de fim', estado.finalizadoEm === null);
  checar('status jogando', estado.status === 'jogando');
  checar('id da grade preservado', estado.gridId === 'limpa-4');
  checar('4x4 limpa tem 30 quadrados vivos', estado.quadradosVivos === 30, `veio ${estado.quadradosVivos}`);
  checar('4x4 tem 40 palitos', Object.keys(estado.palitos).length === 40);
  checar(
    'todos os palitos comecam removiveis',
    Object.values(estado.palitos).every((situacao) => situacao === ESTADOS.REMOVIVEL),
  );
  checar('estado congelado', Object.isFrozen(estado));
  checar('mapa de palitos congelado', Object.isFrozen(estado.palitos));
  checar('historico congelado', Object.isFrozen(estado.historico));

  const misto = { id: 'misto-4', n: 4, quebrados: ['h:0:0'], bloqueados: ['v:0:0'] };
  const comObstaculos = estadoInicial(misto);

  checar('palito quebrado marcado', comObstaculos.palitos['h:0:0'] === ESTADOS.QUEBRADO);
  checar('palito bloqueado marcado', comObstaculos.palitos['v:0:0'] === ESTADOS.BLOQUEADO);
  checar(
    'quebrado mata os 4 quadrados do canto',
    comObstaculos.quadradosVivos === 26,
    `veio ${comObstaculos.quadradosVivos}`,
  );

  const morta = { id: 'morta-4', n: 4, quebrados: todosOsHorizontais(4), bloqueados: [] };
  const jaVencida = estadoInicial(morta);

  checar('grade sem horizontais nasce sem quadrados', jaVencida.quadradosVivos === 0);
  checar('grade que nasce vencida tem status vencido', jaVencida.status === 'vencido');
  checar('grade que nasce vencida nao tem relogio de fim', jaVencida.finalizadoEm === null);

  secao('estadoInicial x criarPartida');

  const config = { id: 'misto-5', n: 5, quebrados: ['h:2:2', 'v:1:3'], bloqueados: ['h:0:0', 'v:4:5'] };
  const inicial = estadoInicial(config);
  const daPartida = criarPartida(config).obterEstado();

  checar(
    'mesmas chaves na mesma ordem',
    JSON.stringify(Object.keys(inicial)) === JSON.stringify(Object.keys(daPartida)),
    JSON.stringify(Object.keys(inicial)),
  );
  checar(
    'campos escalares batem',
    ['n', 'gridId', 'quadradosVivos', 'palitosRemovidos', 'podeDesfazer', 'status']
      .every((campo) => inicial[campo] === daPartida[campo]),
  );
  checar('mapa de palitos bate', JSON.stringify(inicial.palitos) === JSON.stringify(daPartida.palitos));
  checar('5x5 misto tem 40 quadrados vivos', inicial.quadradosVivos === 40, `veio ${inicial.quadradosVivos}`);
  checar(
    'so os campos de relogio divergem',
    inicial.iniciadoEm === null && typeof daPartida.iniciadoEm === 'number',
  );
}

await principal();
