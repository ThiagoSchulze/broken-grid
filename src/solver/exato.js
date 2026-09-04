import * as bits from './bits.js';

const NOS_ENTRE_RELOGIOS = 1024;

export function cotaInferior(instancia, reducao, descobertos, usados) {
  const { palavrasM, palitosDoQuadrado } = instancia;
  const { ordemPorGrau } = reducao;

  usados.fill(0);
  let cota = 0;

  for (let i = 0; i < ordemPorGrau.length; i += 1) {
    const iq = ordemPorGrau[i];
    if (!bits.temBit(descobertos, iq)) continue;
    if (bits.haInterseccao(usados, palitosDoQuadrado, iq * palavrasM, palavrasM)) continue;
    cota += 1;
    bits.unir(usados, palitosDoQuadrado, iq * palavrasM, palavrasM);
  }

  return cota;
}

export function prepararBusca(instancia, reducao, tetoInicial) {
  const { palavrasM, palavrasQ, palitosDoQuadrado, quadradosDoPalito } = instancia;
  const { ativos, ordemPorGrau } = reducao;

  const usados = new Uint32Array(palavrasM);
  const caminho = [];
  const buffers = [];
  const pilha = [];

  let melhorTamanho = tetoInicial;
  let melhorCaminho = null;
  let nos = 0;

  const raiz = Uint32Array.from(ativos);
  const cotaRaiz = cotaInferior(instancia, reducao, raiz, usados);

  if (!bits.estaVazia(raiz, palavrasQ) && melhorTamanho > 0) {
    pilha.push(criarQuadro(raiz, 0));
  }

  function buffer(profundidade) {
    while (buffers.length <= profundidade) buffers.push(new Uint32Array(palavrasQ));
    return buffers[profundidade];
  }

  function escolherQuadrado(descobertos) {
    for (let i = 0; i < ordemPorGrau.length; i += 1) {
      const iq = ordemPorGrau[i];
      if (bits.temBit(descobertos, iq)) return iq;
    }
    return -1;
  }

  function candidatosDe(iq, descobertos) {
    const lista = [];
    const desloc = iq * palavrasM;
    for (let palavra = 0; palavra < palavrasM; palavra += 1) {
      let restante = palitosDoQuadrado[desloc + palavra];
      while (restante !== 0) {
        const isolado = restante & -restante;
        lista.push(palavra * 32 + (31 - Math.clz32(isolado)));
        restante ^= isolado;
      }
    }

    const ganho = new Map();
    for (const ip of lista) {
      ganho.set(ip, bits.contarInterseccao(descobertos, quadradosDoPalito, ip * palavrasQ, palavrasQ));
    }
    lista.sort((a, b) => (ganho.get(b) - ganho.get(a)) || (a - b));
    return lista;
  }

  function criarQuadro(descobertos, profundidade) {
    const iq = escolherQuadrado(descobertos);
    return { descobertos, profundidade, candidatos: candidatosDe(iq, descobertos), proximo: 0 };
  }

  function executarFatia(limiteMs) {
    const fim = agora() + limiteMs;
    let desdeORelogio = 0;

    while (pilha.length > 0) {
      if (desdeORelogio >= NOS_ENTRE_RELOGIOS) {
        desdeORelogio = 0;
        if (agora() >= fim) return 'pausado';
      }
      desdeORelogio += 1;
      nos += 1;

      const topo = pilha[pilha.length - 1];
      if (topo.proximo >= topo.candidatos.length) {
        pilha.pop();
        continue;
      }

      const ip = topo.candidatos[topo.proximo];
      topo.proximo += 1;

      const profundidade = topo.profundidade;
      caminho[profundidade] = ip;

      const proximos = buffer(profundidade);
      bits.copiar(proximos, topo.descobertos, 0, palavrasQ);
      bits.subtrair(proximos, quadradosDoPalito, ip * palavrasQ, palavrasQ);

      if (bits.estaVazia(proximos, palavrasQ)) {
        if (profundidade + 1 < melhorTamanho) {
          melhorTamanho = profundidade + 1;
          melhorCaminho = caminho.slice(0, profundidade + 1);
        }
        continue;
      }

      if (profundidade + 1 + cotaInferior(instancia, reducao, proximos, usados) >= melhorTamanho) continue;

      pilha.push(criarQuadro(proximos, profundidade + 1));
    }

    return 'concluido';
  }

  return {
    executarFatia,
    melhorTamanho: () => melhorTamanho,
    melhorCaminho: () => (melhorCaminho === null ? null : [...melhorCaminho]),
    nos: () => nos,
    cotaRaiz: () => cotaRaiz,
  };
}

function agora() {
  return typeof performance === 'object' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
