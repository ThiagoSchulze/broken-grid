// Regras do cursor do tabuleiro físico (e do teclado no navegador). Livre de DOM.
// Mesmo comportamento de hardware/broken_grid/broken_grid.ino, generalizado para n x n.
// O tabuleiro tem só dois botões de movimento, DIREITA e BAIXO:
//   - o cursor só para em palito removível;
//   - DIREITA vai para o próximo removível da mesma fileira; no fim, volta ao primeiro
//     removível da fileira (dá a volta). Se não houver outro, fica parado;
//   - BAIXO desce para a próxima fileira que tenha algum removível. As fileiras se alternam
//     entre horizontais e verticais (h0, v0, h1, v1, ..., hn) e, depois da última, volta à
//     primeira. Na fileira nova escolhe o palito mais perto na horizontal; no empate fica o
//     de mesmo número de coluna (assim descer várias vezes não vai escorregando para um lado);
//   - empates de distância ficam com o menor índice da corrente de LEDs.
// "Fileira" é uma linha de palitos da mesma orientação: n+1 fileiras de n horizontais e
// n fileiras de n+1 verticais, intercaladas, na mesma ordem da corrente de LEDs.

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

// fileira na ordem da corrente: h:r -> 2r, v:r -> 2r + 1 (total 2n + 1)
function fileiraDe(p) {
  return p.orientacao === HORIZONTAL ? 2 * p.linha : 2 * p.linha + 1;
}

function palitosDaFileira(n, fileira) {
  const orientacao = fileira % 2 === 0 ? HORIZONTAL : VERTICAL;
  const linha = fileira >> 1;
  const { largura } = dimensoes(n, orientacao);
  const ids = [];
  for (let coluna = 0; coluna < largura; coluna += 1) ids.push(idPalito(orientacao, linha, coluna));
  return ids;
}

// DIREITA (passo 1) ou ESQUERDA (passo -1): próximo removível da mesma fileira, dando a volta
export function moverNaFileira(estado, cursor, passo = 1) {
  const p = analisarId(cursor);
  if (!p) return cursor;
  const { largura } = dimensoes(estado.n, p.orientacao);
  for (let k = 1; k < largura; k += 1) {
    const c = (((p.coluna + passo * k) % largura) + largura) % largura;
    const id = idPalito(p.orientacao, p.linha, c);
    if (removivel(estado, id)) return id;
  }
  return cursor;
}

// BAIXO (passo 1) ou CIMA (passo -1): próxima fileira com algum removível, dando a volta;
// na fileira nova, o palito mais perto na horizontal (empate: mesmo número de coluna)
export function moverDeFileira(estado, cursor, passo = 1) {
  const p = analisarId(cursor);
  if (!p) return cursor;
  const total = 2 * estado.n + 1;
  const f0 = fileiraDe(p);
  const x0 = centro(p).x;
  for (let k = 1; k <= total; k += 1) {
    const f = (((f0 + passo * k) % total) + total) % total;
    let melhor = null;
    let melhorDist = Infinity;
    for (const id of palitosDaFileira(estado.n, f)) {
      if (!removivel(estado, id)) continue;
      const q = analisarId(id);
      const d = Math.abs(centro(q).x - x0) * 100 + Math.abs(q.coluna - p.coluna);
      if (d < melhorDist) { melhorDist = d; melhor = id; }
    }
    if (melhor) return melhor;
  }
  return cursor;
}

// direcao = 'direita' | 'baixo' (botões do tabuleiro) ou 'esquerda' | 'cima' (só no teclado)
export function moverCursor(estado, cursor, direcao) {
  if (!analisarId(cursor)) return cursor;
  if (direcao === 'direita') return moverNaFileira(estado, cursor, 1);
  if (direcao === 'esquerda') return moverNaFileira(estado, cursor, -1);
  if (direcao === 'baixo') return moverDeFileira(estado, cursor, 1);
  if (direcao === 'cima') return moverDeFileira(estado, cursor, -1);
  return cursor;
}

// cursor válido para o estado atual: se o palito deixou de ser removível, vai para o mais
// próximo; se não existe cursor, começa no primeiro removível da corrente
export function cursorValido(estado, cursor) {
  if (cursor && removivel(estado, cursor)) return cursor;
  if (cursor && analisarId(cursor)) return maisProximo(estado, cursor) ?? null;
  return primeiroRemovivel(estado);
}
