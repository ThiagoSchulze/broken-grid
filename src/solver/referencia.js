/**
 * Implementacao PROVISORIA do solver (etapa de interface grafica).
 *
 * Devolve a solucao de referencia que o gerador do dataset gravou. Ela e um
 * conjunto irredutivel, porem nao comprovadamente minimo — dai proven: false.
 * Na etapa de algoritmos este arquivo e substituido pela heuristica gulosa
 * mais a busca exata, sem que index.js, core/ ou ui/ precisem mudar.
 */

export class ErroSolver extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroSolver';
  }
}

export async function resolverPorReferencia(config, opcoes = {}) {
  const inicio = Date.now();
  void opcoes; // orcamento de tempo/nos so passa a valer com o solver real
  const referencia = config?.referencia;

  if (!referencia || !Array.isArray(referencia.palitos)) {
    throw new ErroSolver(`grade ${config?.id ?? 'desconhecida'} nao tem solucao de referencia`);
  }

  return {
    palitos: [...referencia.palitos],
    quantidade: referencia.quantidade,
    proven: false,
    origem: 'dataset',
    tempoMs: Date.now() - inicio,
  };
}
