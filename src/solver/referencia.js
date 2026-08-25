export class ErroSolver extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroSolver';
  }
}

export async function resolverPorReferencia(config, opcoes = {}) {
  const inicio = Date.now();
  void opcoes;
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
