import { resolverPorReferencia, ErroSolver } from './referencia.js';

export { ErroSolver };

export async function resolver(config, opcoes = {}) {
  return resolverPorReferencia(config, opcoes);
}
