export const HORIZONTAL = 'h';
export const VERTICAL = 'v';

export function idPalito(orientacao, linha, coluna) {
  return `${orientacao}:${linha}:${coluna}`;
}

export function analisarId(id) {
  if (typeof id !== 'string') return null;
  const partes = id.split(':');
  if (partes.length !== 3) return null;
  const [orientacao, linha, coluna] = partes;
  if (orientacao !== HORIZONTAL && orientacao !== VERTICAL) return null;
  // zeros a esquerda dariam duas chaves para o mesmo palito
  if (!/^(0|[1-9]\d*)$/.test(linha) || !/^(0|[1-9]\d*)$/.test(coluna)) return null;
  return { orientacao, linha: Number(linha), coluna: Number(coluna) };
}

export function palitoValido(id, n) {
  const p = analisarId(id);
  if (!p) return false;
  const maxLinha = p.orientacao === HORIZONTAL ? n : n - 1;
  const maxColuna = p.orientacao === HORIZONTAL ? n - 1 : n;
  return p.linha <= maxLinha && p.coluna <= maxColuna;
}

export function listarPalitos(n) {
  const palitos = [];
  for (let linha = 0; linha <= n; linha += 1) {
    for (let coluna = 0; coluna < n; coluna += 1) {
      palitos.push(idPalito(HORIZONTAL, linha, coluna));
    }
  }
  for (let linha = 0; linha < n; linha += 1) {
    for (let coluna = 0; coluna <= n; coluna += 1) {
      palitos.push(idPalito(VERTICAL, linha, coluna));
    }
  }
  return palitos;
}

export function bordasDoQuadrado(tamanho, linha, coluna) {
  const bordas = [];
  for (let i = 0; i < tamanho; i += 1) {
    bordas.push(idPalito(HORIZONTAL, linha, coluna + i));
    bordas.push(idPalito(HORIZONTAL, linha + tamanho, coluna + i));
    bordas.push(idPalito(VERTICAL, linha + i, coluna));
    bordas.push(idPalito(VERTICAL, linha + i, coluna + tamanho));
  }
  return bordas;
}

export function listarQuadrados(n) {
  const quadrados = [];
  for (let tamanho = 1; tamanho <= n; tamanho += 1) {
    for (let linha = 0; linha + tamanho <= n; linha += 1) {
      for (let coluna = 0; coluna + tamanho <= n; coluna += 1) {
        quadrados.push({ tamanho, linha, coluna, bordas: bordasDoQuadrado(tamanho, linha, coluna) });
      }
    }
  }
  return quadrados;
}
