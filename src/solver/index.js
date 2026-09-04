import { compilarInstancia, reduzirInstancia, ErroSolver } from './instancia.js';
import { resolverGuloso } from './guloso.js';
import { prepararBusca } from './exato.js';
import * as bits from './bits.js';

export { ErroSolver };

export const ORCAMENTO_PADRAO = Object.freeze({ 4: 100, 5: 100, 6: 100, 7: 2000 });

const FATIA_PADRAO_MS = 8;

export async function resolver(config, { orcamentoMs, fatiaMs, sinal, aoMelhorar } = {}) {
  const inicio = agora();
  conferirCancelamento(sinal);

  const instancia = compilarInstancia(config);
  const quadradosVivos = instancia.q;
  const reducao = reduzirInstancia(instancia);
  const quadradosAposReducao = bits.contar(reducao.ativos, 0, instancia.palavrasQ);

  const inicioGuloso = agora();
  const guloso = resolverGuloso(instancia, reducao);
  const tempoGuloso = agora() - inicioGuloso;

  const busca = prepararBusca(instancia, reducao, guloso.alemDosObrigatorios);
  const base = {
    guloso: { quantidade: guloso.escolhidos.length, tempoMs: tempoGuloso },
    cotaInferior: reducao.obrigatorios.length + busca.cotaRaiz(),
    obrigatorios: reducao.obrigatorios.length,
    palitosRemoviveis: instancia.m,
    quadradosVivos,
    quadradosAposReducao,
  };

  const inicioExato = agora();

  const relatar = (caminho, origem, concluiu) => montar(instancia, reducao, guloso, caminho, {
    proven: concluiu,
    origem,
    tempoMs: agora() - inicio,
    diagnostico: {
      ...base,
      exato: {
        quantidade: reducao.obrigatorios.length + busca.melhorTamanho(),
        tempoMs: agora() - inicioExato,
        nos: busca.nos(),
        concluiu,
      },
    },
  });

  notificar(aoMelhorar, relatar(null, 'guloso', false));

  const limite = orcamentoMs ?? ORCAMENTO_PADRAO[instancia.n] ?? 1000;
  const fatia = fatiaMs ?? FATIA_PADRAO_MS;

  let situacao = 'pausado';
  let ultimoRelatado = guloso.alemDosObrigatorios;

  while (situacao === 'pausado') {
    situacao = busca.executarFatia(fatia);
    if (situacao === 'concluido') break;

    if (busca.melhorTamanho() < ultimoRelatado) {
      ultimoRelatado = busca.melhorTamanho();
      notificar(aoMelhorar, relatar(busca.melhorCaminho(), 'exato', false));
    }

    if (agora() - inicioExato >= limite) break;
    await ceder();
    conferirCancelamento(sinal);
  }

  const concluiu = situacao === 'concluido';
  const caminho = busca.melhorCaminho();
  return relatar(caminho, caminho === null ? 'guloso' : 'exato', concluiu);
}

function montar(instancia, reducao, guloso, caminho, extras) {
  const indices = caminho === null ? guloso.escolhidos : [...reducao.obrigatorios, ...caminho];
  const palitos = indices.map((ip) => instancia.palitos[ip]);
  return { palitos, quantidade: palitos.length, ...extras };
}

function notificar(aoMelhorar, parcial) {
  const retorno = aoMelhorar?.(parcial);
  // aoMelhorar async que rejeita nao pode virar unhandled rejection
  if (retorno && typeof retorno.then === 'function') retorno.catch(() => {});
}

function conferirCancelamento(sinal) {
  if (sinal?.aborted) throw new ErroSolver('busca cancelada', { cancelado: true });
}

function ceder() {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

function agora() {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
