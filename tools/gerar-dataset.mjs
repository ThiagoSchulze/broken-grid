/**
 * Curadoria offline das grades. Nunca roda no navegador.
 *
 * Uso: node tools/gerar-dataset.mjs [--quantidade 20] [--seed 20260819]
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listarPalitos } from '../src/core/geometry.js';
import { montarGrade, registrarAusencia, registrarPresenca } from '../src/core/grid.js';
import { ESTADOS } from '../src/core/rules.js';

const TAMANHOS = [4, 5, 6, 7];
const MINIMO_QUADRADOS_VIVOS = 4;
const MAX_TENTATIVAS = 200;

/** Mulberry32: PRNG deterministico, para o dataset ser reproduzivel a partir do seed. */
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

export function classificarDificuldade(quantidade) {
  if (quantidade <= 4) return 'facil';
  if (quantidade <= 9) return 'medio';
  return 'dificil';
}

/**
 * 1. sorteia quebrados
 * 2. constroi um conjunto de corte que elimina todos os quadrados vivos
 * 3. poda os palitos redundantes do corte (fica irredutivel)
 * 4. sorteia bloqueados apenas FORA do corte -> RN04 e RN05 valem por construcao
 */
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
      // Um quadrado vivo tem todos os lados presentes e, nesta fase, nenhum bloqueado ainda.
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

    return {
      n,
      quebrados,
      bloqueados,
      dificuldade: classificarDificuldade(corte.length),
      referencia: { palitos: corte, quantidade: corte.length, proven: false },
    };
  }
  throw new Error(`nao foi possivel gerar grade ${n}x${n} em ${MAX_TENTATIVAS} tentativas`);
}

export function gerarDataset(n, { seed, quantidade = 20, geradoEm = '2026-08-19' } = {}) {
  const rng = criarRng(seed);
  const grids = [];
  const assinaturas = new Set();

  while (grids.length < quantidade) {
    const config = gerarGrade(n, rng);
    const assinatura = JSON.stringify([config.quebrados, config.bloqueados]);
    if (assinaturas.has(assinatura)) continue;
    assinaturas.add(assinatura);

    grids.push({
      id: `g${n}-${String(grids.length + 1).padStart(3, '0')}`,
      quebrados: config.quebrados,
      bloqueados: config.bloqueados,
      dificuldade: config.dificuldade,
      referencia: config.referencia,
    });
  }

  return { schemaVersion: 1, n, geradoEm, seed, grids };
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
    const dataset = gerarDataset(n, { seed: seedBase + n, quantidade });
    const arquivo = resolve(destino, `${n}x${n}.json`);
    await writeFile(arquivo, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
    console.log(`${arquivo}: ${dataset.grids.length} grades`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
