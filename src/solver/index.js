import { resolverPorReferencia, ErroSolver } from './referencia.js';

export { ErroSolver };

/**
 * Contrato publico do solver. Sempre recebe a configuracao INICIAL da grade
 * (RN07), nunca o progresso do jogador.
 *
 * @returns {Promise<{palitos: string[], quantidade: number, proven: boolean,
 *   origem: 'dataset'|'guloso'|'exato', tempoMs: number}>}
 */
export async function resolver(config, opcoes = {}) {
  return resolverPorReferencia(config, opcoes);
}
