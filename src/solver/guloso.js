import * as bits from './bits.js';
import { ErroSolver } from './instancia.js';

export function cobre(instancia, universo, palitos) {
  const { palavrasQ, quadradosDoPalito } = instancia;
  const restante = Uint32Array.from(universo);
  for (const ip of palitos) bits.subtrair(restante, quadradosDoPalito, ip * palavrasQ, palavrasQ);
  return bits.estaVazia(restante, palavrasQ);
}

export function resolverGuloso(instancia, reducao) {
  const { m, palavrasQ, quadradosDoPalito } = instancia;

  const descobertos = Uint32Array.from(reducao.ativos);
  const gulosos = [];

  while (!bits.estaVazia(descobertos, palavrasQ)) {
    let melhor = -1;
    let melhorGanho = 0;

    for (let ip = 0; ip < m; ip += 1) {
      const ganho = bits.contarInterseccao(descobertos, quadradosDoPalito, ip * palavrasQ, palavrasQ);
      if (ganho > melhorGanho) {
        melhorGanho = ganho;
        melhor = ip;
      }
    }

    if (melhor === -1) throw new ErroSolver('nenhum palito cobre os quadrados restantes');

    gulosos.push(melhor);
    bits.subtrair(descobertos, quadradosDoPalito, melhor * palavrasQ, palavrasQ);
  }

  for (let i = gulosos.length - 1; i >= 0; i -= 1) {
    const resto = gulosos.filter((_, j) => j !== i);
    if (cobre(instancia, reducao.ativos, resto)) gulosos.splice(i, 1);
  }

  return {
    escolhidos: [...reducao.obrigatorios, ...gulosos],
    alemDosObrigatorios: gulosos.length,
  };
}
