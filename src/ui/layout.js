import { analisarId, HORIZONTAL } from '../core/geometry.js';

export function calcularLayout(n, { margem = 24, passo = 80 } = {}) {
  const lado = margem * 2 + n * passo;
  return { n, margem, passo, largura: lado, altura: lado };
}

export function coordenadasDoPalito(id, layout) {
  const p = analisarId(id);
  if (!p) return null;

  const x = layout.margem + p.coluna * layout.passo;
  const y = layout.margem + p.linha * layout.passo;

  return p.orientacao === HORIZONTAL
    ? { x1: x, y1: y, x2: x + layout.passo, y2: y }
    : { x1: x, y1: y, x2: x, y2: y + layout.passo };
}
