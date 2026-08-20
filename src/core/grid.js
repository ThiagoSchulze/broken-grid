import { listarPalitos, listarQuadrados, palitoValido } from './geometry.js';
import { ESTADOS } from './rules.js';

export const TAMANHOS_SUPORTADOS = Object.freeze([4, 5, 6, 7]);

export class ErroGrade extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroGrade';
  }
}

/**
 * Monta a grade a partir da configuracao inicial e constroi, uma unica vez,
 * o indice reverso palito -> quadrados afetados.
 */
export function montarGrade({ n, quebrados = [], bloqueados = [] } = {}) {
  if (!TAMANHOS_SUPORTADOS.includes(n)) {
    throw new ErroGrade(`tamanho de grade nao suportado: ${n}`);
  }
  validarLista(quebrados, n, 'quebrados');
  validarLista(bloqueados, n, 'bloqueados');

  const emAmbas = quebrados.filter((id) => bloqueados.includes(id));
  if (emAmbas.length > 0) {
    throw new ErroGrade(`palito quebrado e bloqueado ao mesmo tempo: ${emAmbas[0]}`);
  }

  const palitos = new Map(listarPalitos(n).map((id) => [id, ESTADOS.REMOVIVEL]));
  const quadrados = listarQuadrados(n).map((q) => ({ ...q, ausentes: 0 }));

  const indice = new Map();
  quadrados.forEach((quadrado, i) => {
    for (const borda of quadrado.bordas) {
      if (!indice.has(borda)) indice.set(borda, []);
      indice.get(borda).push(i);
    }
  });

  const grade = { n, palitos, quadrados, indice, quadradosVivos: quadrados.length };

  for (const id of bloqueados) palitos.set(id, ESTADOS.BLOQUEADO);
  for (const id of quebrados) {
    palitos.set(id, ESTADOS.QUEBRADO);
    registrarAusencia(grade, id);
  }

  return grade;
}

function validarLista(lista, n, rotulo) {
  if (!Array.isArray(lista)) throw new ErroGrade(`${rotulo} deve ser uma lista`);
  const vistos = new Set();
  for (const id of lista) {
    if (!palitoValido(id, n)) throw new ErroGrade(`palito invalido em ${rotulo}: ${id}`);
    if (vistos.has(id)) throw new ErroGrade(`palito repetido em ${rotulo}: ${id}`);
    vistos.add(id);
  }
}

/** O palito deixou de estar presente: atualiza so os quadrados que ele toca. */
export function registrarAusencia(grade, id) {
  for (const i of grade.indice.get(id) ?? []) {
    const quadrado = grade.quadrados[i];
    quadrado.ausentes += 1;
    if (quadrado.ausentes === 1) grade.quadradosVivos -= 1;
  }
}

/** O palito voltou a estar presente (desfazer). */
export function registrarPresenca(grade, id) {
  for (const i of grade.indice.get(id) ?? []) {
    const quadrado = grade.quadrados[i];
    quadrado.ausentes -= 1;
    if (quadrado.ausentes === 0) grade.quadradosVivos += 1;
  }
}
