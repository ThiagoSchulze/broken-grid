// Uso: node tools/gerar-dataset.mjs [--quantidade 20] [--seed 20260819]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listarPalitos } from '../src/core/geometry.js';
import { montarGrade, registrarAusencia, registrarPresenca } from '../src/core/grid.js';
import { ESTADOS } from '../src/core/rules.js';
import { resolver } from '../src/solver/index.js';

const TAMANHOS = [4, 5, 6, 7];
const MINIMO_QUADRADOS_VIVOS = 4;
const MAX_TENTATIVAS = 200;

// A dificuldade e o minimo da grade dividido pelo minimo da grade limpa do mesmo
// tamanho. A razao normaliza a escala: com limiar absoluto toda 6x6 e toda 7x7
// caem na faixa "dificil". Limiares calibrados sobre as 80 grades versionadas
// (ver docs/algoritmo-do-solver.md, secao 9).
const LIMIAR_FACIL = 0.58;
const LIMIAR_MEDIO = 0.75;

// Generoso de proposito: o rotulo so vale se o minimo for comprovadamente otimo,
// senao dependeria da velocidade da maquina que gerou o dataset.
const ORCAMENTO_MINIMO_MS = 60000;

export function criarRng(seed) {
  let estado = seed >>> 0;
  return function proximo() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escolher(rng, lista) {
  return lista[Math.floor(rng() * lista.length)];
}

export function classificarDificuldade(minimo, referencia) {
  if (!(referencia > 0)) throw new Error(`referencia invalida para a dificuldade: ${referencia}`);
  const razao = minimo / referencia;
  if (razao <= LIMIAR_FACIL) return 'facil';
  if (razao <= LIMIAR_MEDIO) return 'medio';
  return 'dificil';
}

export async function minimoProvado(config, rotulo) {
  const resultado = await resolver(config, { orcamentoMs: ORCAMENTO_MINIMO_MS, fatiaMs: 500 });
  if (!resultado.proven) {
    throw new Error(`o solver nao provou o minimo de ${rotulo} em ${ORCAMENTO_MINIMO_MS} ms`);
  }
  return resultado.quantidade;
}

const referencias = new Map();

export async function referenciaDaGradeLimpa(n) {
  if (!referencias.has(n)) {
    referencias.set(n, await minimoProvado({ n, quebrados: [], bloqueados: [] }, `grade limpa ${n}x${n}`));
  }
  return referencias.get(n);
}

export function gerarGrade(n, rng, { proporcaoQuebrados = 0.12, proporcaoBloqueados = 0.25 } = {}) {
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa += 1) {
    const todos = listarPalitos(n);
    const quebrados = todos.filter(() => rng() < proporcaoQuebrados);

    const grade = montarGrade({ n, quebrados });
    if (grade.quadradosVivos < MINIMO_QUADRADOS_VIVOS) continue;

    const corte = [];
    while (grade.quadradosVivos > 0) {
      const vivos = grade.quadrados.filter((q) => q.ausentes === 0);
      const alvo = escolher(rng, vivos);
      const candidatos = alvo.bordas.filter((b) => grade.palitos.get(b) === ESTADOS.REMOVIVEL);
      const escolhido = escolher(rng, candidatos);
      grade.palitos.set(escolhido, ESTADOS.REMOVIDO);
      registrarAusencia(grade, escolhido);
      corte.push(escolhido);
    }

    for (const id of [...corte]) {
      grade.palitos.set(id, ESTADOS.REMOVIVEL);
      registrarPresenca(grade, id);
      if (grade.quadradosVivos === 0) {
        corte.splice(corte.indexOf(id), 1);
      } else {
        grade.palitos.set(id, ESTADOS.REMOVIDO);
        registrarAusencia(grade, id);
      }
    }

    const noCorte = new Set(corte);
    const quebradosSet = new Set(quebrados);
    const bloqueados = todos.filter(
      (id) => !noCorte.has(id) && !quebradosSet.has(id) && rng() < proporcaoBloqueados,
    );

    return { n, quebrados, bloqueados };
  }
  throw new Error(`nao foi possivel gerar grade ${n}x${n} em ${MAX_TENTATIVAS} tentativas`);
}

export async function gerarDataset(n, { seed, quantidade = 20, geradoEm = '2026-08-19' } = {}) {
  const rng = criarRng(seed);
  const referencia = await referenciaDaGradeLimpa(n);
  const grids = [];
  const assinaturas = new Set();

  while (grids.length < quantidade) {
    const config = gerarGrade(n, rng);
    const assinatura = JSON.stringify([config.quebrados, config.bloqueados]);
    if (assinaturas.has(assinatura)) continue;
    assinaturas.add(assinatura);

    const id = `g${n}-${String(grids.length + 1).padStart(3, '0')}`;
    const minimo = await minimoProvado({ n, quebrados: config.quebrados, bloqueados: config.bloqueados }, id);

    grids.push({
      id,
      quebrados: config.quebrados,
      bloqueados: config.bloqueados,
      dificuldade: classificarDificuldade(minimo, referencia),
    });
  }

  return { schemaVersion: 1, n, geradoEm, seed, grids };
}

export function contarDificuldades(grids) {
  const contagem = { facil: 0, medio: 0, dificil: 0 };
  for (const grid of grids) contagem[grid.dificuldade] += 1;
  return contagem;
}

function lerArgumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : Number(process.argv[i + 1]);
}

async function principal() {
  const quantidade = lerArgumento('quantidade', 20);
  const seedBase = lerArgumento('seed', 20260819);
  const destino = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'grids');
  await mkdir(destino, { recursive: true });

  for (const n of TAMANHOS) {
    const dataset = await gerarDataset(n, { seed: seedBase + n, quantidade });
    const arquivo = resolve(destino, `${n}x${n}.json`);
    await writeFile(arquivo, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

    const contagem = contarDificuldades(dataset.grids);
    const referencia = await referenciaDaGradeLimpa(n);
    console.log(
      `${arquivo}: ${dataset.grids.length} grades (referencia ${referencia} palitos; `
      + `${contagem.facil} facil, ${contagem.medio} medio, ${contagem.dificil} dificil)`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
