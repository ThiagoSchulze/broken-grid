import { montarGrade } from '../core/grid.js';
import { ESTADOS } from '../core/rules.js';
import * as bits from './bits.js';

export class ErroSolver extends Error {
  constructor(mensagem, { cancelado = false } = {}) {
    super(mensagem);
    this.name = 'ErroSolver';
    this.cancelado = cancelado;
  }
}

export function compilarInstancia(config) {
  const grade = montarGrade(config);

  const palitos = [];
  const indiceDoPalito = new Map();
  for (const [id, estado] of grade.palitos) {
    if (estado !== ESTADOS.REMOVIVEL) continue;
    indiceDoPalito.set(id, palitos.length);
    palitos.push(id);
  }

  const vivos = grade.quadrados.filter((quadrado) => quadrado.ausentes === 0);

  const m = palitos.length;
  const q = vivos.length;
  const palavrasM = bits.palavras(m);
  const palavrasQ = bits.palavras(q);

  const palitosDoQuadrado = new Uint32Array(q * palavrasM);
  const quadradosDoPalito = new Uint32Array(m * palavrasQ);

  for (let iq = 0; iq < q; iq += 1) {
    for (const borda of vivos[iq].bordas) {
      const ip = indiceDoPalito.get(borda);
      if (ip === undefined) continue;
      palitosDoQuadrado[iq * palavrasM + (ip >>> 5)] |= 1 << (ip & 31);
      quadradosDoPalito[ip * palavrasQ + (iq >>> 5)] |= 1 << (iq & 31);
    }
  }

  return { n: grade.n, m, q, palavrasM, palavrasQ, palitos, palitosDoQuadrado, quadradosDoPalito };
}

export function reduzirInstancia(instancia) {
  const { m, q, palavrasM, palitosDoQuadrado } = instancia;

  const ativos = bits.criarMascara(q);
  for (let iq = 0; iq < q; iq += 1) bits.definirBit(ativos, iq);

  const vivos = bits.criarMascara(m);
  for (let ip = 0; ip < m; ip += 1) bits.definirBit(vivos, ip);

  const obrigatorios = [];
  let mudou = true;

  while (mudou) {
    mudou = false;
    if (forcarUnitarios(instancia, ativos, vivos, obrigatorios)) mudou = true;
    if (descartarQuadradosDominados(instancia, ativos)) mudou = true;
    if (descartarPalitosDominados(instancia, ativos, vivos)) mudou = true;
  }

  const grau = new Int32Array(q);
  const ordem = [];
  for (let iq = 0; iq < q; iq += 1) {
    if (!bits.temBit(ativos, iq)) continue;
    grau[iq] = bits.contar(palitosDoQuadrado, iq * palavrasM, palavrasM);
    ordem.push(iq);
  }
  ordem.sort((a, b) => (grau[a] - grau[b]) || (a - b));

  return { ativos, obrigatorios, grau, ordemPorGrau: Int32Array.from(ordem) };
}

function forcarUnitarios(instancia, ativos, vivos, obrigatorios) {
  const { q, palavrasM, palavrasQ, palitosDoQuadrado, quadradosDoPalito } = instancia;
  let mudou = false;

  for (let iq = 0; iq < q; iq += 1) {
    if (!bits.temBit(ativos, iq)) continue;
    const grau = bits.contar(palitosDoQuadrado, iq * palavrasM, palavrasM);
    if (grau === 0) throw new ErroSolver('quadrado sem lado removivel: instancia impossivel');
    if (grau !== 1) continue;

    const ip = primeiroBit(palitosDoQuadrado, iq * palavrasM, palavrasM);
    obrigatorios.push(ip);
    bits.subtrair(ativos, quadradosDoPalito, ip * palavrasQ, palavrasQ);
    descartarPalito(instancia, vivos, ip);
    mudou = true;
  }

  return mudou;
}

function descartarQuadradosDominados(instancia, ativos) {
  const { q, palavrasM, palitosDoQuadrado } = instancia;
  let mudou = false;

  for (let a = 0; a < q; a += 1) {
    if (!bits.temBit(ativos, a)) continue;
    for (let b = 0; b < q; b += 1) {
      if (a === b || !bits.temBit(ativos, b)) continue;
      if (!bits.contido(palitosDoQuadrado, b * palavrasM, a * palavrasM, palavrasM)) continue;
      if (bits.iguais(palitosDoQuadrado, a * palavrasM, b * palavrasM, palavrasM) && a < b) continue;
      limparBitDe(ativos, a);
      mudou = true;
      break;
    }
  }

  return mudou;
}

function descartarPalitosDominados(instancia, ativos, vivos) {
  const { m, palavrasQ, quadradosDoPalito } = instancia;
  let mudou = false;

  for (let p = 0; p < m; p += 1) {
    if (!bits.temBit(vivos, p)) continue;
    for (let r = 0; r < m; r += 1) {
      if (p === r || !bits.temBit(vivos, r)) continue;
      if (!bits.contidoComFiltro(quadradosDoPalito, p * palavrasQ, r * palavrasQ, ativos, palavrasQ)) continue;
      if (bits.iguaisComFiltro(quadradosDoPalito, p * palavrasQ, r * palavrasQ, ativos, palavrasQ) && p < r) continue;
      descartarPalito(instancia, vivos, p);
      mudou = true;
      break;
    }
  }

  return mudou;
}

function descartarPalito(instancia, vivos, ip) {
  const { q, palavrasM, palavrasQ, palitosDoQuadrado, quadradosDoPalito } = instancia;
  limparBitDe(vivos, ip);
  bits.zerarBloco(quadradosDoPalito, ip * palavrasQ, palavrasQ);
  for (let iq = 0; iq < q; iq += 1) bits.limparBitEm(palitosDoQuadrado, iq * palavrasM, ip);
}

function limparBitDe(mascara, i) {
  mascara[i >>> 5] &= ~(1 << (i & 31));
}

function primeiroBit(fonte, desloc, n) {
  for (let i = 0; i < n; i += 1) {
    const palavra = fonte[desloc + i];
    if (palavra !== 0) return i * 32 + (31 - Math.clz32(palavra & -palavra));
  }
  return -1;
}
