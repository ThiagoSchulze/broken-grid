// Regras do cursor do tabuleiro físico (e do teclado no navegador). Livre de DOM.
// Mesmo comportamento de hardware/broken_grid/broken_grid.ino, generalizado para n x n:
//   - o cursor só para em palito removível;
//   - ao longo da linha vai para o próximo removível; se não houver, fica parado;
//   - para outra linha escolhe a próxima linha com algum removível, no palito mais próximo
//     da coluna atual (empate: menor coluna);
//   - mexer no controle da outra orientação troca para o removível mais próximo dela;
//   - empates de distância ficam com o menor índice da corrente de LEDs.
// "Linha" é uma fileira de palitos da mesma orientação: n+1 linhas de n horizontais e
// n linhas de n+1 verticais.

import { analisarId, idPalito, HORIZONTAL, VERTICAL } from './geometry.js';
import { ESTADOS } from './rules.js';

// Corrente em zigue-zague: linha de horizontais da esquerda para a direita, depois a linha
// de verticais logo abaixo da direita para a esquerda. Para n = 4:
//   h:r:c -> 9r + c      v:r:c -> 9r + 4 + (4 - c)
export function indiceNaCorrente(id, n) {
  const p = analisarId(id);
  if (!p) return -1;
  const passo = 2 * n + 1;
  return p.orientacao === HORIZONTAL
    ? p.linha * passo + p.coluna
    : p.linha * passo + n + (n - p.coluna);
}

const ordensPorN = new Map();

// todos os ids na ordem da corrente (LED 0, LED 1, ...)
export function ordemDaCorrente(n) {
  if (ordensPorN.has(n)) return ordensPorN.get(n);
  const ids = [];
  for (let linha = 0; linha <= n; linha += 1) {
    for (let coluna = 0; coluna < n; coluna += 1) ids.push(idPalito(HORIZONTAL, linha, coluna));
    if (linha === n) break;
    for (let coluna = n; coluna >= 0; coluna -= 1) ids.push(idPalito(VERTICAL, linha, coluna));
  }
  const congelada = Object.freeze(ids);
  ordensPorN.set(n, congelada);
  return congelada;
}

function removivel(estado, id) {
  return estado.palitos[id] === ESTADOS.REMOVIVEL;
}

// centro do palito em meias-casas: h:r:c -> (2c+1, 2r)   v:r:c -> (2c, 2r+1)
function centro(p) {
  return p.orientacao === HORIZONTAL
    ? { x: 2 * p.coluna + 1, y: 2 * p.linha }
    : { x: 2 * p.coluna, y: 2 * p.linha + 1 };
}

export function primeiroRemovivel(estado) {
  for (const id of ordemDaCorrente(estado.n)) if (removivel(estado, id)) return id;
  return null;
}

// removível mais próximo do centro de 'origem'; orientacao = 'h', 'v' ou null (qualquer)
export function maisProximo(estado, origem, orientacao = null) {
  const o = analisarId(origem);
  if (!o) return null;
  const c0 = centro(o);
  let melhor = null;
  let melhorDist = Infinity;
  for (const id of ordemDaCorrente(estado.n)) {
    if (!removivel(estado, id)) continue;
    const p = analisarId(id);
    if (orientacao && p.orientacao !== orientacao) continue;
    const c = centro(p);
    const d = (c.x - c0.x) ** 2 + (c.y - c0.y) ** 2;
    if (d < melhorDist) { melhorDist = d; melhor = id; }
  }
  return melhor;
}

function dimensoes(n, orientacao) {
  return orientacao === HORIZONTAL
    ? { linhas: n + 1, largura: n }
    : { linhas: n, largura: n + 1 };
}

export function moverAoLongo(estado, cursor, passo) {
  const p = analisarId(cursor);
  if (!p) return cursor;
  const { largura } = dimensoes(estado.n, p.orientacao);
  for (let c = p.coluna + passo; c >= 0 && c < largura; c += passo) {
    const id = idPalito(p.orientacao, p.linha, c);
    if (removivel(estado, id)) return id;
  }
  return cursor;
}

export function moverEntreLinhas(estado, cursor, passo) {
  const p = analisarId(cursor);
  if (!p) return cursor;
  const { linhas, largura } = dimensoes(estado.n, p.orientacao);
  for (let r = p.linha + passo; r >= 0 && r < linhas; r += passo) {
    let melhor = null;
    let melhorDist = Infinity;
    for (let c = 0; c < largura; c += 1) {
      const id = idPalito(p.orientacao, r, c);
      const d = Math.abs(c - p.coluna);
      if (removivel(estado, id) && d < melhorDist) { melhorDist = d; melhor = id; }
    }
    if (melhor) return melhor;
  }
  return cursor;
}

// controle = 'h' ou 'v'; dx/dy em -1, 0, 1 (dx > 0 direita, dy > 0 para baixo)
export function moverCursor(estado, cursor, controle, dx, dy) {
  const p = analisarId(cursor);
  if (!p) return cursor;
  if (p.orientacao !== controle) return maisProximo(estado, cursor, controle) ?? cursor;
  if (dx) return moverAoLongo(estado, cursor, Math.sign(dx));
  if (dy) return moverEntreLinhas(estado, cursor, Math.sign(dy));
  return cursor;
}

// Potenciômetro como posição: o par de potenciômetros aponta para (linha, coluna) de uma
// orientação. Fica nesse palito se ele for removível; senão, vai para o removível mais
// próximo dele, da mesma orientação. Sem nenhum removível dessa orientação, não muda.
export function posicionarCursor(estado, cursor, orientacao, linha, coluna) {
  const { linhas, largura } = dimensoes(estado.n, orientacao);
  const l = Math.min(Math.max(linha, 0), linhas - 1);
  const c = Math.min(Math.max(coluna, 0), largura - 1);
  const alvo = idPalito(orientacao, l, c);
  if (removivel(estado, alvo)) return alvo;
  return maisProximo(estado, alvo, orientacao) ?? cursor;
}

// cursor válido para o estado atual: se o palito deixou de ser removível, vai para o mais
// próximo; se não existe cursor, começa no primeiro removível da corrente
export function cursorValido(estado, cursor) {
  if (cursor && removivel(estado, cursor)) return cursor;
  if (cursor && analisarId(cursor)) return maisProximo(estado, cursor) ?? null;
  return primeiroRemovivel(estado);
}
