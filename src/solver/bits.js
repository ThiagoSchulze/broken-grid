export function palavras(bits) {
  return Math.max(1, Math.ceil(bits / 32));
}

export function criarMascara(bits) {
  return new Uint32Array(palavras(bits));
}

export function definirBit(mascara, i) {
  mascara[i >>> 5] |= 1 << (i & 31);
}

export function temBit(mascara, i) {
  return (mascara[i >>> 5] & (1 << (i & 31))) !== 0;
}

export function popcount(x) {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

export function contar(fonte, desloc, n) {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += popcount(fonte[desloc + i]);
  return total;
}

export function contarInterseccao(filtro, fonte, desloc, n) {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += popcount(filtro[i] & fonte[desloc + i]);
  return total;
}

export function subtrair(alvo, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) alvo[i] &= ~fonte[desloc + i];
}

export function unir(alvo, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) alvo[i] |= fonte[desloc + i];
}

export function copiar(alvo, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) alvo[i] = fonte[desloc + i];
}

export function estaVazia(mascara, n) {
  for (let i = 0; i < n; i += 1) if (mascara[i] !== 0) return false;
  return true;
}

export function haInterseccao(filtro, fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) if ((filtro[i] & fonte[desloc + i]) !== 0) return true;
  return false;
}

export function contido(fonte, deslocA, deslocB, n) {
  for (let i = 0; i < n; i += 1) {
    if ((fonte[deslocA + i] & ~fonte[deslocB + i]) !== 0) return false;
  }
  return true;
}

export function iguais(fonte, deslocA, deslocB, n) {
  for (let i = 0; i < n; i += 1) {
    if (fonte[deslocA + i] !== fonte[deslocB + i]) return false;
  }
  return true;
}

export function contidoComFiltro(fonte, deslocA, deslocB, filtro, n) {
  for (let i = 0; i < n; i += 1) {
    const a = fonte[deslocA + i] & filtro[i];
    const b = fonte[deslocB + i] & filtro[i];
    if ((a & ~b) !== 0) return false;
  }
  return true;
}

export function iguaisComFiltro(fonte, deslocA, deslocB, filtro, n) {
  for (let i = 0; i < n; i += 1) {
    if ((fonte[deslocA + i] & filtro[i]) !== (fonte[deslocB + i] & filtro[i])) return false;
  }
  return true;
}

export function limparBitEm(fonte, desloc, i) {
  fonte[desloc + (i >>> 5)] &= ~(1 << (i & 31));
}

export function zerarBloco(fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) fonte[desloc + i] = 0;
}
