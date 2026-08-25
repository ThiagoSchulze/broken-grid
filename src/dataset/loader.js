import { palitoValido } from '../core/geometry.js';
import { TAMANHOS_SUPORTADOS } from '../core/grid.js';

const VERSAO_SUPORTADA = 1;
const DIFICULDADES = ['facil', 'medio', 'dificil'];

export class ErroDataset extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDataset';
  }
}

export function validarDataset(dados) {
  if (!dados || typeof dados !== 'object') throw new ErroDataset('dataset vazio ou invalido');
  if (dados.schemaVersion !== VERSAO_SUPORTADA) {
    throw new ErroDataset(`versao de schema nao suportada: ${dados.schemaVersion}`);
  }
  if (!TAMANHOS_SUPORTADOS.includes(dados.n)) {
    throw new ErroDataset(`tamanho de grade nao suportado: ${dados.n}`);
  }
  if (!Array.isArray(dados.grids) || dados.grids.length === 0) {
    throw new ErroDataset('dataset sem grades');
  }

  const ids = new Set();
  for (const grid of dados.grids) {
    if (typeof grid.id !== 'string' || grid.id === '') throw new ErroDataset('grade sem id');
    if (ids.has(grid.id)) throw new ErroDataset(`id de grade repetido: ${grid.id}`);
    ids.add(grid.id);

    const quebrados = listaDePalitos(grid.quebrados, dados.n, `${grid.id}.quebrados`);
    const bloqueados = listaDePalitos(grid.bloqueados, dados.n, `${grid.id}.bloqueados`);

    const conflito = quebrados.find((id) => bloqueados.includes(id));
    if (conflito) throw new ErroDataset(`${grid.id}: ${conflito} quebrado e bloqueado ao mesmo tempo`);

    if (grid.dificuldade !== undefined && !DIFICULDADES.includes(grid.dificuldade)) {
      throw new ErroDataset(`${grid.id}: dificuldade invalida ${grid.dificuldade}`);
    }

    const referencia = grid.referencia;
    if (!referencia || typeof referencia !== 'object') {
      throw new ErroDataset(`${grid.id}: referencia ausente`);
    }
    const palitos = listaDePalitos(referencia.palitos, dados.n, `${grid.id}.referencia`);
    if (referencia.quantidade !== palitos.length) {
      throw new ErroDataset(`${grid.id}: quantidade da referencia nao bate com a lista`);
    }
    for (const id of palitos) {
      if (quebrados.includes(id)) throw new ErroDataset(`${grid.id}: referencia usa palito quebrado ${id}`);
      if (bloqueados.includes(id)) throw new ErroDataset(`${grid.id}: referencia usa palito bloqueado ${id}`);
    }
  }

  return dados;
}

function listaDePalitos(lista, n, rotulo) {
  if (!Array.isArray(lista)) throw new ErroDataset(`${rotulo} deve ser uma lista`);
  const vistos = new Set();
  for (const id of lista) {
    if (!palitoValido(id, n)) throw new ErroDataset(`${rotulo}: palito invalido ${id}`);
    if (vistos.has(id)) throw new ErroDataset(`${rotulo}: palito repetido ${id}`);
    vistos.add(id);
  }
  return lista;
}

export async function carregarDataset(n, { buscar = fetch } = {}) {
  const url = `data/grids/${n}x${n}.json`;
  let resposta;
  try {
    resposta = await buscar(url);
  } catch (erro) {
    throw new ErroDataset(`falha ao buscar ${url}: ${erro?.message ?? String(erro)}`);
  }
  if (!resposta.ok) throw new ErroDataset(`falha ao buscar ${url}: HTTP ${resposta.status}`);

  const texto = await resposta.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (erro) {
    throw new ErroDataset(`${url} nao e JSON valido: ${erro.message}`);
  }

  return validarDataset(dados);
}

export function escolherGrade(dataset, { rng = Math.random, exceto = null } = {}) {
  const candidatas = dataset.grids.filter((grid) => grid.id !== exceto);
  const lista = candidatas.length > 0 ? candidatas : dataset.grids;
  return lista[Math.floor(rng() * lista.length)];
}

export function configDaGrade(dataset, grid) {
  return {
    id: grid.id,
    n: dataset.n,
    quebrados: grid.quebrados,
    bloqueados: grid.bloqueados,
    referencia: grid.referencia,
  };
}
