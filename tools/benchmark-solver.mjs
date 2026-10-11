// Uso: node tools/benchmark-solver.mjs [--teto 30000] [--rapido] [--saida docs/dados/benchmark-solver.json]
//
// Mede o guloso e o exato (branch and bound) em tres bancadas:
//   A  grades do jogo (data/grids, 4x4 a 7x7), com a dificuldade rotulada no dataset
//   B  grades geradas de 8x8 a 14x14, com a dificuldade dada pelo perfil de geracao
//   C  escala do guloso: grades cada vez maiores, com e sem a etapa de reducao
// Cada instancia roda num Worker proprio, cortado a forca no teto: a reducao nao e
// fatiada e numa grade grande travaria o processo sem esse corte.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PERFIS = Object.freeze({
  facil: { proporcaoQuebrados: 0.20, proporcaoBloqueados: 0.30 },
  medio: { proporcaoQuebrados: 0.12, proporcaoBloqueados: 0.25 },
  dificil: { proporcaoQuebrados: 0.05, proporcaoBloqueados: 0.20 },
});

const SEED_B = 20260921;
const SEED_C = 20260922;

if (isMainThread) {
  await principal();
} else {
  await trabalhar(workerData);
}

// ---------------------------------------------------------------- worker

async function trabalhar({ config, modo, tetoMs, reduzir }) {
  const { compilarInstancia, reduzirInstancia } = await import('../src/solver/instancia.js');
  const { resolverGuloso } = await import('../src/solver/guloso.js');
  const { prepararBusca } = await import('../src/solver/exato.js');
  const bits = await import('../src/solver/bits.js');

  const inicio = performance.now();
  const prazo = inicio + tetoMs;
  const enviar = (dados) => parentPort.postMessage(dados);

  const t0 = performance.now();
  const instancia = compilarInstancia(config);
  const t1 = performance.now();
  enviar({ fase: 'compilado', m: instancia.m, q: instancia.q, compilarMs: t1 - t0 });

  let reducao;
  if (modo === 'guloso' && !reduzir) {
    // guloso puro: todo quadrado vivo continua no universo e nada e obrigatorio
    const ativos = bits.criarMascara(instancia.q);
    for (let iq = 0; iq < instancia.q; iq += 1) bits.definirBit(ativos, iq);
    reducao = { ativos, obrigatorios: [] };
  } else {
    reducao = reduzirInstancia(instancia);
  }
  const t2 = performance.now();

  let palitosAposReducao = 0;
  for (let ip = 0; ip < instancia.m; ip += 1) {
    if (bits.contarInterseccao(reducao.ativos, instancia.quadradosDoPalito, ip * instancia.palavrasQ, instancia.palavrasQ) > 0) {
      palitosAposReducao += 1;
    }
  }
  enviar({
    fase: 'reduzido',
    reduzirMs: t2 - t1,
    quadradosAposReducao: bits.contar(reducao.ativos, 0, instancia.palavrasQ),
    palitosAposReducao,
    obrigatorios: reducao.obrigatorios.length,
  });

  const guloso = resolverGuloso(instancia, reducao);
  const t3 = performance.now();
  enviar({
    fase: 'guloso',
    gulosoMs: t3 - t2,
    guloso: guloso.escolhidos.length,
    solucaoGulosa: guloso.escolhidos.map((ip) => instancia.palitos[ip]),
  });

  if (modo === 'guloso') {
    enviar({ fase: 'fim' });
    return;
  }

  const busca = prepararBusca(instancia, reducao, guloso.alemDosObrigatorios);
  const cotaInferior = reducao.obrigatorios.length + busca.cotaRaiz();
  let situacao = 'pausado';
  while (situacao === 'pausado') {
    const restante = prazo - performance.now();
    if (restante <= 0) break;
    situacao = busca.executarFatia(Math.min(250, restante));
    enviar({
      fase: 'progresso',
      exatoMs: performance.now() - t3,
      exato: reducao.obrigatorios.length + busca.melhorTamanho(),
      nos: busca.nos(),
    });
  }

  const caminho = busca.melhorCaminho();
  const indices = caminho === null ? guloso.escolhidos : [...reducao.obrigatorios, ...caminho];
  enviar({
    fase: 'exato',
    exatoMs: performance.now() - t3,
    exato: indices.length,
    provado: situacao === 'concluido',
    nos: busca.nos(),
    cotaInferior,
    solucaoExata: indices.map((ip) => instancia.palitos[ip]),
  });
  enviar({ fase: 'fim' });
}

// ---------------------------------------------------------------- orquestracao

function medir(config, { modo, tetoMs, reduzir = true }) {
  return new Promise((concluir) => {
    const resultado = { estourou: false };
    const worker = new Worker(new URL(import.meta.url), { workerData: { config, modo, tetoMs, reduzir } });

    // margem para o worker encerrar sozinho; depois disso e corte a forca
    const corte = setTimeout(() => {
      resultado.estourou = true;
      worker.terminate();
    }, tetoMs + 5000);

    worker.on('message', (dados) => {
      const { fase, ...resto } = dados;
      if (fase === 'fim') return;
      Object.assign(resultado, resto);
    });
    worker.on('error', (erro) => { resultado.erro = erro.message; });
    worker.on('exit', () => {
      clearTimeout(corte);
      concluir(resultado);
    });
  });
}

async function validar(config, palitos) {
  if (!palitos) return null;
  const { montarGrade, registrarAusencia } = await import('../src/core/grid.js');
  const { ESTADOS } = await import('../src/core/rules.js');
  const grade = montarGrade(config);
  for (const id of palitos) {
    if (grade.palitos.get(id) !== ESTADOS.REMOVIVEL) return false;
    grade.palitos.set(id, ESTADOS.REMOVIDO);
    registrarAusencia(grade, id);
  }
  return grade.quadradosVivos === 0;
}

function resumoConfig(config) {
  return { n: config.n, quebrados: config.quebrados.length, bloqueados: config.bloqueados.length };
}

async function executarCompleto(config, meta, tetoMs) {
  const r = await medir(config, { modo: 'completo', tetoMs });
  const registro = {
    ...meta,
    ...resumoConfig(config),
    palitosRemoviveis: r.m ?? null,
    quadradosVivos: r.q ?? null,
    quadradosAposReducao: r.quadradosAposReducao ?? null,
    palitosAposReducao: r.palitosAposReducao ?? null,
    obrigatorios: r.obrigatorios ?? null,
    tempos: {
      compilarMs: r.compilarMs ?? null,
      reduzirMs: r.reduzirMs ?? null,
      gulosoMs: r.gulosoMs ?? null,
      exatoMs: r.exatoMs ?? null,
    },
    guloso: r.guloso ?? null,
    exato: r.exato ?? null,
    provado: r.provado ?? false,
    nos: r.nos ?? null,
    cotaInferior: r.cotaInferior ?? null,
    estourou: r.estourou,
    erro: r.erro ?? null,
    gulosoValido: await validar(config, r.solucaoGulosa),
    exatoValido: await validar(config, r.solucaoExata),
  };
  const total = soma(registro.tempos);
  console.log(
    `  ${meta.bancada} ${config.n}x${config.n} ${meta.id.padEnd(14)} ${String(meta.dificuldade).padEnd(8)}`
    + ` q=${String(registro.quadradosVivos).padStart(4)}->${String(registro.quadradosAposReducao).padStart(4)}`
    + ` guloso=${registro.guloso} exato=${registro.exato}${registro.provado ? ' (provado)' : ' (NAO provado)'}`
    + ` ${formatarMs(total)}${registro.gulosoValido === false || registro.exatoValido === false ? ' SOLUCAO INVALIDA' : ''}`,
  );
  return registro;
}

function soma(tempos) {
  return Object.values(tempos).reduce((acc, v) => acc + (v ?? 0), 0);
}

function formatarMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`;
}

async function bancadaA(tetoMs, rapido) {
  console.log('\n== Bancada A: grades do jogo (data/grids)');
  const registros = [];
  for (const n of [4, 5, 6, 7]) {
    const dataset = JSON.parse(await readFile(resolve(RAIZ, 'data', 'grids', `${n}x${n}.json`), 'utf8'));
    const grids = rapido ? dataset.grids.slice(0, 2) : dataset.grids;
    for (const grid of grids) {
      const config = { n, quebrados: grid.quebrados, bloqueados: grid.bloqueados };
      registros.push(await executarCompleto(config, { bancada: 'A', id: grid.id, dificuldade: grid.dificuldade }, tetoMs));
    }
    const limpa = { n, quebrados: [], bloqueados: [] };
    registros.push(await executarCompleto(limpa, { bancada: 'A', id: `limpa-${n}`, dificuldade: 'limpa' }, tetoMs));
  }
  return registros;
}

async function bancadaB(tetoMs, rapido, porPerfil) {
  const { gerarGrade, criarRng } = await import('./gerar-dataset.mjs');
  console.log('\n== Bancada B: grades geradas 8x8 a 14x14');
  const registros = [];
  const tamanhos = rapido ? [8] : [8, 9, 10, 11, 12, 13, 14];
  for (const n of tamanhos) {
    for (const [perfil, parametros] of Object.entries(PERFIS)) {
      const rng = criarRng(SEED_B + n * 100 + Object.keys(PERFIS).indexOf(perfil));
      for (let i = 1; i <= porPerfil; i += 1) {
        const config = gerarGrade(n, rng, parametros);
        const id = `b${n}-${perfil}-${i}`;
        registros.push(await executarCompleto(config, { bancada: 'B', id, dificuldade: perfil }, tetoMs));
      }
    }
    const limpa = { n, quebrados: [], bloqueados: [] };
    registros.push(await executarCompleto(limpa, { bancada: 'B', id: `limpa-${n}`, dificuldade: 'limpa' }, tetoMs));
  }
  return registros;
}

async function bancadaC(tetoMs, rapido) {
  const { gerarGrade, criarRng } = await import('./gerar-dataset.mjs');
  console.log('\n== Bancada C: escala do guloso, com e sem reducao');
  const tamanhos = rapido ? [4, 8, 12] : [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64];
  const porTamanho = rapido ? 1 : 3;
  const registros = [];
  const esgotou = { com: false, sem: false };

  for (const n of tamanhos) {
    if (esgotou.com && esgotou.sem) break;
    const rng = criarRng(SEED_C + n);
    const configs = [];
    for (let i = 0; i < porTamanho; i += 1) configs.push(gerarGrade(n, rng, PERFIS.medio));

    for (const variante of ['com', 'sem']) {
      if (esgotou[variante]) continue;
      for (let i = 0; i < configs.length; i += 1) {
        const r = await medir(configs[i], { modo: 'guloso', tetoMs, reduzir: variante === 'com' });
        const tempos = {
          compilarMs: r.compilarMs ?? null,
          reduzirMs: r.reduzirMs ?? null,
          gulosoMs: r.gulosoMs ?? null,
        };
        const total = soma(tempos);
        const estourou = r.estourou || r.gulosoMs === undefined || total > tetoMs;
        registros.push({
          bancada: 'C',
          id: `c${n}-${i + 1}`,
          variante,
          ...resumoConfig(configs[i]),
          palitosRemoviveis: r.m ?? null,
          quadradosVivos: r.q ?? null,
          quadradosAposReducao: r.quadradosAposReducao ?? null,
          obrigatorios: r.obrigatorios ?? null,
          tempos,
          totalMs: total,
          guloso: r.guloso ?? null,
          estourou,
          erro: r.erro ?? null,
          gulosoValido: await validar(configs[i], r.solucaoGulosa),
        });
        console.log(
          `  C ${n}x${n} #${i + 1} ${variante === 'com' ? 'com reducao' : 'sem reducao'}`
          + ` q=${r.q ?? '?'} guloso=${r.guloso ?? '-'} ${estourou ? 'ESTOUROU o teto' : formatarMs(total)}`,
        );
        if (estourou) {
          esgotou[variante] = true;
          break;
        }
      }
    }
  }
  return registros;
}

function lerArgumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : process.argv[i + 1];
}

async function principal() {
  const tetoMs = Number(lerArgumento('teto', 30000));
  const rapido = process.argv.includes('--rapido');
  const saida = resolve(RAIZ, lerArgumento('saida', 'docs/dados/benchmark-solver.json'));
  const porPerfil = rapido ? 1 : 4;

  const inicio = Date.now();
  const cpus = os.cpus();
  const ambiente = {
    data: new Date().toISOString(),
    node: process.version,
    so: `${os.type()} ${os.release()}`,
    cpu: cpus[0]?.model?.trim() ?? 'desconhecida',
    nucleos: cpus.length,
    memoriaGB: Number((os.totalmem() / 2 ** 30).toFixed(1)),
  };
  console.log(`Benchmark do solver: teto ${tetoMs} ms por instancia${rapido ? ' (modo rapido)' : ''}`);
  console.log(`${ambiente.cpu}, ${ambiente.nucleos} nucleos, ${ambiente.memoriaGB} GB, Node ${ambiente.node}`);

  // --bancadas C refaz so a C e preserva as outras do arquivo ja gravado
  const bancadas = String(lerArgumento('bancadas', 'A,B,C')).split(',');
  const anterior = await lerRelatorio(saida);
  const relatorio = {
    schemaVersion: 1,
    ambiente,
    parametros: { tetoMs, porPerfilB: porPerfil, perfis: PERFIS, seedB: SEED_B, seedC: SEED_C, rapido },
    duracaoMs: 0,
    instancias: anterior?.instancias ?? { A: [], B: [], C: [] },
  };

  const executores = {
    A: () => bancadaA(tetoMs, rapido),
    B: () => bancadaB(tetoMs, rapido, porPerfil),
    C: () => bancadaC(tetoMs, rapido),
  };
  await mkdir(dirname(saida), { recursive: true });
  for (const nome of bancadas) {
    relatorio.instancias[nome] = await executores[nome]();
    // grava a cada bancada: uma queda adiante nao apaga o que ja foi medido
    relatorio.duracaoMs = (anterior?.duracaoMs ?? 0) + (Date.now() - inicio);
    await writeFile(saida, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8');
  }

  const { A, B, C } = relatorio.instancias;
  const invalidas = [...A, ...B, ...C].filter((r) => r.gulosoValido === false || r.exatoValido === false);
  console.log(`\n${A.length + B.length} instancias completas e ${C.length} medicoes de escala em ${formatarMs(Date.now() - inicio)}`);
  console.log(invalidas.length === 0 ? 'todas as solucoes validas' : `${invalidas.length} SOLUCOES INVALIDAS`);
  console.log(`gravado em ${saida}`);
  process.exitCode = invalidas.length === 0 ? 0 : 1;
}

async function lerRelatorio(caminho) {
  try {
    return JSON.parse(await readFile(caminho, 'utf8'));
  } catch {
    return null;
  }
}
