// Uso: node tools/relatorio-pdf.mjs [--modo relatorio|dados] [--dados docs/dados/benchmark-solver.json]
//        [--saida caminho.pdf] [--html caminho.html]
//
// Le o JSON do benchmark-solver, monta HTML e imprime em PDF com o Chrome headless.
//   relatorio  analise com graficos -> docs/relatorio-desempenho-algoritmos.pdf
//   dados      anexo so com tabelas e todas as metricas -> docs/dados-experimentais.pdf
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DIFICULDADES = ['facil', 'medio', 'dificil', 'limpa'];
const NOME_DIFICULDADE = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', limpa: 'Grade limpa' };

// rampa ordinal azul (validada com dataviz/validate_palette --ordinal) e dois slots categoricos
const COR_DIFICULDADE = { facil: '#86b6ef', medio: '#3987e5', dificil: '#1c5cab', limpa: '#0d366b' };
const COR = { guloso: '#2a78d6', exato: '#eb6834', limpa: '#1baf7a', neutro: '#52514e' };
const SUPERFICIE = '#fcfcfb';

const LIMITE_INTERATIVO_MS = 100;
const LIMITE_ACEITAVEL_MS = 2000;

// ---------------------------------------------------------------- estatistica

const mediana = (valores) => {
  const v = valores.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
};
const media = (valores) => (valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null);
const maximo = (valores) => (valores.length ? Math.max(...valores) : null);

function tempoGuloso(r) {
  const t = r.tempos;
  if (t.gulosoMs === null || t.gulosoMs === undefined) return null;
  return t.compilarMs + t.reduzirMs + t.gulosoMs;
}

function tempoExato(r, tetoMs) {
  const g = tempoGuloso(r);
  if (g === null || r.tempos.exatoMs === null) return tetoMs;
  return g + r.tempos.exatoMs;
}

function agrupar(lista, chave) {
  const mapa = new Map();
  for (const item of lista) {
    const k = chave(item);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(item);
  }
  return mapa;
}

// tamanho analitico da instancia: palitos e quadrados de uma grade n x n
const palitosDe = (n) => 2 * n * (n + 1);
const quadradosDe = (n) => (n * (n + 1) * (2 * n + 1)) / 6;

// ---------------------------------------------------------------- formatacao

const nf = (valor, casas = 0) => valor.toLocaleString('pt-BR', {
  minimumFractionDigits: casas, maximumFractionDigits: casas,
});

function fmtTempo(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1) return `${nf(ms, 2)} ms`;
  if (ms < 10) return `${nf(ms, 1)} ms`;
  if (ms < 1000) return `${nf(ms, 0)} ms`;
  return `${nf(ms / 1000, ms < 10000 ? 2 : 1)} s`;
}

function fmtNumero(valor) {
  if (valor === null || valor === undefined) return '—';
  if (valor >= 1e6) return `${nf(valor / 1e6, 1)} mi`;
  if (valor >= 1e4) return `${nf(valor / 1e3, 0)} mil`;
  return nf(valor, 0);
}

function fmtTick(ms) {
  if (ms < 1) return `${nf(ms, 1)} ms`;
  return ms < 1000 ? `${nf(ms, 0)} ms` : `${nf(ms / 1000, 0)} s`;
}

function fmtTickNumero(v) {
  if (v >= 1e6) return `${nf(v / 1e6, 0)} mi`;
  if (v >= 1e3) return `${nf(v / 1e3, 0)} mil`;
  return nf(v, 0);
}

const pct = (valor, casas = 0) => `${nf(valor * 100, casas)}%`;

const esc = (texto) => String(texto)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- graficos SVG

function escalaLog(min, max, a, b) {
  const lmin = Math.log10(min);
  const lmax = Math.log10(max);
  return (v) => a + ((Math.log10(Math.max(v, min)) - lmin) / (lmax - lmin)) * (b - a);
}

function escalaLinear(min, max, a, b) {
  return (v) => a + ((v - min) / (max - min)) * (b - a);
}

function ticksLog(min, max) {
  const ticks = [];
  for (let e = Math.ceil(Math.log10(min)); e <= Math.floor(Math.log10(max)); e += 1) ticks.push(10 ** e);
  return ticks;
}

function legendaHtml(itens) {
  return `<div class="legenda">${itens.map((i) => `<span class="legenda__item">${
    i.forma === 'linha'
      ? `<svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${i.cor}" stroke-width="2"${i.tracejado ? ' stroke-dasharray="4 3"' : ''}/><circle cx="11" cy="5" r="3.2" fill="${i.vazio ? SUPERFICIE : i.cor}" stroke="${i.cor}" stroke-width="1.5"/></svg>`
      : i.forma === 'vazio'
        ? `<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="${SUPERFICIE}" stroke="${i.cor}" stroke-width="1.5"/></svg>`
        : `<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="${i.cor}"/></svg>`
  }${esc(i.rotulo)}</span>`).join('')}</div>`;
}

function grafico({
  largura = 640, altura = 290, x, y, series = [], referencias = [], rotulosDiretos = false,
}) {
  const margem = { esq: 62, dir: rotulosDiretos ? 118 : 18, topo: 12, base: 42 };
  const x0 = margem.esq;
  const x1 = largura - margem.dir;
  const y0 = altura - margem.base;
  const y1 = margem.topo;
  const sx = x.log ? escalaLog(x.min, x.max, x0, x1) : escalaLinear(x.min, x.max, x0, x1);
  const sy = y.log ? escalaLog(y.min, y.max, y0, y1) : escalaLinear(y.min, y.max, y0, y1);
  const partes = [];

  const ticksY = y.ticks ?? (y.log ? ticksLog(y.min, y.max) : []);
  for (const t of ticksY) {
    partes.push(`<line x1="${x0}" x2="${x1}" y1="${sy(t)}" y2="${sy(t)}" class="grade"/>`);
    partes.push(`<text x="${x0 - 8}" y="${sy(t) + 3.5}" text-anchor="end" class="eixo">${esc(y.formatar(t))}</text>`);
  }
  for (const t of x.ticks) {
    partes.push(`<line x1="${sx(t)}" x2="${sx(t)}" y1="${y0}" y2="${y0 + 4}" class="eixo-linha"/>`);
    partes.push(`<text x="${sx(t)}" y="${y0 + 17}" text-anchor="middle" class="eixo">${esc(x.formatar(t))}</text>`);
  }
  partes.push(`<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" class="eixo-linha"/>`);
  partes.push(`<text x="${(x0 + x1) / 2}" y="${altura - 6}" text-anchor="middle" class="eixo-titulo">${esc(x.rotulo)}</text>`);
  partes.push(`<text transform="translate(13 ${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle" class="eixo-titulo">${esc(y.rotulo)}</text>`);

  for (const ref of referencias) {
    const py = sy(ref.y);
    partes.push(`<line x1="${x0}" x2="${x1}" y1="${py}" y2="${py}" class="referencia"/>`);
    partes.push(`<text x="${x0 + 5}" y="${py - 4}" class="referencia-texto">${esc(ref.rotulo)}</text>`);
  }

  for (const s of series) {
    const pontos = s.pontos.filter((p) => p.y !== null && p.y !== undefined);
    if (s.linha && pontos.length > 1) {
      const d = pontos.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
      partes.push(`<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="2"${s.tracejado ? ' stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`);
    }
    for (const p of pontos) {
      const r = s.raio ?? 4;
      const px = sx(p.x) + (p.deslocamento ?? 0);
      partes.push(p.vazio
        ? `<circle cx="${px.toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${r}" fill="${SUPERFICIE}" stroke="${s.cor}" stroke-width="1.5"/>`
        : `<circle cx="${px.toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${r}" fill="${s.cor}" stroke="${SUPERFICIE}" stroke-width="1"${s.opacidade ? ` fill-opacity="${s.opacidade}"` : ''}/>`);
    }
    if (rotulosDiretos && s.rotulo && pontos.length) {
      const ultimo = pontos[pontos.length - 1];
      partes.push(`<text x="${sx(ultimo.x) + 9}" y="${sy(ultimo.y) + 3.5 + (s.ajusteRotulo ?? 0)}" class="rotulo-direto">${esc(s.rotulo)}</text>`);
    }
  }

  return `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" width="100%" role="img">${partes.join('')}</svg>`;
}

function graficoBarras({ largura = 640, altura = 230, categorias, valores, cor, rotuloX, rotuloY, rotuloValor }) {
  const margem = { esq: 52, dir: 18, topo: 18, base: 42 };
  const x0 = margem.esq;
  const x1 = largura - margem.dir;
  const y0 = altura - margem.base;
  const y1 = margem.topo;
  const topoY = Math.max(1, ...valores) * 1.12;
  const sy = escalaLinear(0, topoY, y0, y1);
  const passo = (x1 - x0) / categorias.length;
  const larguraBarra = Math.min(46, passo - 8);
  const partes = [];

  const passoTick = topoY > 40 ? 10 : topoY > 16 ? 5 : topoY > 6 ? 2 : 1;
  for (let t = 0; t <= topoY; t += passoTick) {
    partes.push(`<line x1="${x0}" x2="${x1}" y1="${sy(t)}" y2="${sy(t)}" class="grade"/>`);
    partes.push(`<text x="${x0 - 8}" y="${sy(t) + 3.5}" text-anchor="end" class="eixo">${t}</text>`);
  }
  categorias.forEach((cat, i) => {
    const cx = x0 + passo * (i + 0.5);
    const v = valores[i];
    const topo = sy(v);
    const r = Math.min(4, (y0 - topo) / 2);
    const esq = cx - larguraBarra / 2;
    const dir = cx + larguraBarra / 2;
    if (v > 0) {
      partes.push(`<path d="M${esq} ${y0} L${esq} ${topo + r} Q${esq} ${topo} ${esq + r} ${topo} L${dir - r} ${topo} Q${dir} ${topo} ${dir} ${topo + r} L${dir} ${y0} Z" fill="${cor}"/>`);
      partes.push(`<text x="${cx}" y="${topo - 5}" text-anchor="middle" class="rotulo-valor">${esc(rotuloValor(v, i))}</text>`);
    }
    partes.push(`<text x="${cx}" y="${y0 + 16}" text-anchor="middle" class="eixo">${esc(cat)}</text>`);
  });
  partes.push(`<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" class="eixo-linha"/>`);
  partes.push(`<text x="${(x0 + x1) / 2}" y="${altura - 6}" text-anchor="middle" class="eixo-titulo">${esc(rotuloX)}</text>`);
  partes.push(`<text transform="translate(13 ${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle" class="eixo-titulo">${esc(rotuloY)}</text>`);
  return `<svg class="grafico" viewBox="0 0 ${largura} ${altura}" width="100%" role="img">${partes.join('')}</svg>`;
}

function desenharGrade(config, solucao, { passo = 44, margem = 14 } = {}) {
  const n = config.n;
  const lado = n * passo + 2 * margem;
  const quebrados = new Set(config.quebrados);
  const bloqueados = new Set(config.bloqueados);
  const escolhidos = new Set(solucao);
  const linhas = [];
  const pontos = [];

  const segmento = (id) => {
    const [o, l, c] = id.split(':');
    const L = Number(l);
    const C = Number(c);
    return o === 'h'
      ? [margem + C * passo, margem + L * passo, margem + (C + 1) * passo, margem + L * passo]
      : [margem + C * passo, margem + L * passo, margem + C * passo, margem + (L + 1) * passo];
  };

  const todos = [];
  for (let l = 0; l <= n; l += 1) for (let c = 0; c < n; c += 1) todos.push(`h:${l}:${c}`);
  for (let l = 0; l < n; l += 1) for (let c = 0; c <= n; c += 1) todos.push(`v:${l}:${c}`);

  for (const id of todos) {
    const [xa, ya, xb, yb] = segmento(id);
    let estilo;
    if (quebrados.has(id)) estilo = 'stroke="#c9c7c1" stroke-width="2" stroke-dasharray="3 4"';
    else if (bloqueados.has(id)) estilo = 'stroke="#1f1f1d" stroke-width="5"';
    else if (escolhidos.has(id)) estilo = `stroke="${COR.exato}" stroke-width="5"`;
    else estilo = 'stroke="#a9b8c9" stroke-width="4"';
    linhas.push(`<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" ${estilo} stroke-linecap="round"/>`);
  }
  for (let l = 0; l <= n; l += 1) {
    for (let c = 0; c <= n; c += 1) {
      pontos.push(`<circle cx="${margem + c * passo}" cy="${margem + l * passo}" r="2.6" fill="#52514e"/>`);
    }
  }
  return `<svg viewBox="0 0 ${lado} ${lado}" width="${lado * 0.62}" role="img">${linhas.join('')}${pontos.join('')}</svg>`;
}

function celulaFracao(provadas, total) {
  if (total === 0) return '<td class="num vazio">—</td>';
  const f = provadas / total;
  // degraus da rampa sequencial azul: claro para "poucas provadas", escuro para "todas"
  const fundo = f === 1 ? '#256abf' : f >= 0.75 ? '#5598e7' : f >= 0.5 ? '#86b6ef' : f > 0 ? '#b7d3f6' : '#f0efec';
  const tinta = f >= 0.75 ? '#ffffff' : '#0b0b0b';
  return `<td class="num" style="background:${fundo};color:${tinta}">${provadas}/${total}</td>`;
}

// ---------------------------------------------------------------- analise

function analisar(dados) {
  const teto = dados.parametros.tetoMs;
  const completas = [...dados.instancias.A, ...dados.instancias.B].map((r) => ({
    ...r,
    tg: tempoGuloso(r),
    te: tempoExato(r, teto),
    otimo: r.provado ? r.exato : null,
  }));
  const provadas = completas.filter((r) => r.provado);
  const tamanhos = [...new Set(completas.map((r) => r.n))].sort((a, b) => a - b);

  const porTamanhoDif = new Map();
  for (const n of tamanhos) {
    for (const dif of DIFICULDADES) {
      const grupo = completas.filter((r) => r.n === n && r.dificuldade === dif);
      if (grupo.length) porTamanhoDif.set(`${n}|${dif}`, grupo);
    }
  }

  // maior n tal que todos os tamanhos ate ele cumprem o criterio; um tamanho maior
  // que volte a cumprir depois de uma falha nao conta (e ruido de amostra, nao limite)
  const limiteContiguo = (criterio) => {
    const limite = {};
    for (const dif of DIFICULDADES) {
      for (const n of tamanhos) {
        const grupo = porTamanhoDif.get(`${n}|${dif}`);
        if (!grupo) continue;
        if (!criterio(grupo)) break;
        limite[dif] = n;
      }
    }
    return limite;
  };
  const todasProvadas = (g) => g.every((r) => r.provado);
  const limiteProva = limiteContiguo(todasProvadas);
  const limiteInterativo = limiteContiguo((g) => todasProvadas(g) && mediana(g.map((r) => r.te)) <= LIMITE_INTERATIVO_MS);
  const limiteAceitavel = limiteContiguo((g) => todasProvadas(g) && mediana(g.map((r) => r.te)) <= LIMITE_ACEITAVEL_MS);

  // tamanhos alem do limite que voltaram a ter todas provadas
  const retornos = [];
  for (const dif of DIFICULDADES) {
    for (const n of tamanhos) {
      const grupo = porTamanhoDif.get(`${n}|${dif}`);
      if (grupo && n > (limiteProva[dif] ?? 0) && todasProvadas(grupo)) retornos.push({ dif, n });
    }
  }

  // zona de transicao em quadrados apos as podas
  const qProvadas = completas.filter((r) => r.provado).map((r) => r.quadradosAposReducao);
  const qNaoProvadas = completas.filter((r) => !r.provado).map((r) => r.quadradosAposReducao);
  const transicao = qNaoProvadas.length ? {
    abaixoTodas: Math.min(...qNaoProvadas),
    acimaNenhuma: Math.max(...qProvadas),
    naZona: completas.filter((r) => r.quadradosAposReducao >= Math.min(...qNaoProvadas) && r.quadradosAposReducao <= Math.max(...qProvadas)),
  } : null;

  const excessos = provadas.map((r) => r.guloso - r.otimo);
  const gulosoOtimo = excessos.filter((e) => e === 0).length;
  const excessoRel = provadas.map((r) => (r.guloso - r.otimo) / r.otimo);

  const naoProvadas = completas.filter((r) => !r.provado);
  const melhoriaSobreGuloso = naoProvadas.map((r) => r.guloso - r.exato);
  const lacunas = naoProvadas.filter((r) => r.cotaInferior !== null).map((r) => (r.exato - r.cotaInferior) / r.exato);

  const razaoTempos = provadas.filter((r) => r.tg > 0).map((r) => r.te / r.tg);

  const C = dados.instancias.C ?? [];
  const escalaGuloso = {};
  for (const variante of ['com', 'sem']) {
    const doVariante = C.filter((r) => r.variante === variante);
    const ok = doVariante.filter((r) => !r.estourou);
    const falhou = doVariante.filter((r) => r.estourou);
    escalaGuloso[variante] = {
      maiorN: ok.length ? Math.max(...ok.map((r) => r.n)) : null,
      primeiroEstouro: falhou.length ? Math.min(...falhou.map((r) => r.n)) : null,
      porN: [...agrupar(ok, (r) => r.n)].map(([n, g]) => ({ n, t: mediana(g.map((r) => r.totalMs)), guloso: mediana(g.map((r) => r.guloso)) })).sort((a, b) => a.n - b.n),
    };
    // expoente local t ~ n^k entre os dois maiores tamanhos medidos, e o n estimado para o teto
    const pts = escalaGuloso[variante].porN;
    if (pts.length >= 2) {
      const [a, b] = pts.slice(-2);
      const k = Math.log(b.t / a.t) / Math.log(b.n / a.n);
      escalaGuloso[variante].expoente = k;
      escalaGuloso[variante].nNoTeto = b.n * (teto / b.t) ** (1 / k);
    }
  }

  return {
    teto, completas, provadas, naoProvadas, tamanhos, porTamanhoDif,
    limiteProva, limiteInterativo, limiteAceitavel, retornos, transicao,
    excessos, gulosoOtimo, excessoRel, melhoriaSobreGuloso, lacunas, razaoTempos,
    C, escalaGuloso,
  };
}

// ---------------------------------------------------------------- secoes

function tabelaPorTamanho(an, bancada) {
  const linhas = [];
  for (const n of an.tamanhos) {
    for (const dif of DIFICULDADES) {
      const grupo = (an.porTamanhoDif.get(`${n}|${dif}`) ?? []).filter((r) => r.bancada === bancada);
      if (!grupo.length) continue;
      const provadas = grupo.filter((r) => r.provado);
      const exc = provadas.map((r) => r.guloso - r.otimo);
      linhas.push(`<tr${dif === 'limpa' ? ' class="linha-limpa"' : ''}>
        <td>${n}×${n}</td><td>${NOME_DIFICULDADE[dif]}</td><td class="num">${grupo.length}</td>
        <td class="num">${nf(mediana(grupo.map((r) => r.quadradosVivos)), 0)}</td>
        <td class="num">${nf(mediana(grupo.map((r) => r.quadradosAposReducao)), 0)}</td>
        <td class="num">${fmtTempo(mediana(grupo.map((r) => r.tg)))}</td>
        <td class="num">${fmtTempo(mediana(grupo.map((r) => r.te)))}</td>
        <td class="num">${fmtTempo(maximo(grupo.map((r) => r.te)))}</td>
        <td class="num">${fmtNumero(mediana(grupo.map((r) => r.nos)))}</td>
        ${celulaFracao(provadas.length, grupo.length)}
        <td class="num">${exc.length ? nf(media(exc), 2) : '—'}</td>
      </tr>`);
    }
  }
  return `<table class="dados">
    <thead><tr>
      <th rowspan="2">Grade</th><th rowspan="2">Nível</th><th rowspan="2" class="num">Inst.</th>
      <th colspan="2" class="grupo">Quadrados vivos</th>
      <th class="grupo">Guloso</th><th colspan="3" class="grupo">Exato</th>
      <th rowspan="2" class="num">Provadas<br>em ${an.teto / 1000} s</th><th rowspan="2" class="num">Excesso<br>do guloso</th>
    </tr><tr>
      <th class="num">início</th><th class="num">após podas</th>
      <th class="num">mediana</th><th class="num">mediana</th><th class="num">máximo</th><th class="num">nós (med.)</th>
    </tr></thead>
    <tbody>${linhas.join('')}</tbody>
  </table>`;
}

function figuraTempoPorTamanho(an) {
  const semLimpa = an.completas.filter((r) => r.dificuldade !== 'limpa');
  const porN = [...agrupar(semLimpa, (r) => r.n)].sort((a, b) => a[0] - b[0]);
  const limpas = an.completas.filter((r) => r.dificuldade === 'limpa').sort((a, b) => a.n - b.n);
  const todosTempos = an.completas.flatMap((r) => [r.tg, r.te]).filter((v) => v > 0);
  const yMin = 10 ** Math.floor(Math.log10(Math.min(...todosTempos)));

  const nMin = an.tamanhos[0];
  const nMax = an.tamanhos[an.tamanhos.length - 1];
  return grafico({
    rotulosDiretos: true,
    x: { min: nMin - 0.5, max: nMax + 0.5, ticks: an.tamanhos, rotulo: 'Tamanho da grade (n × n)', formatar: (t) => `${t}` },
    y: { log: true, min: yMin, max: an.teto * 3, rotulo: 'Tempo (escala log)', formatar: fmtTick },
    referencias: [
      { y: LIMITE_INTERATIVO_MS, rotulo: 'interativo · 100 ms' },
      { y: LIMITE_ACEITAVEL_MS, rotulo: 'aceitável · 2 s' },
      { y: an.teto, rotulo: `teto do teste · ${an.teto / 1000} s` },
    ],
    series: [
      { cor: COR.exato, raio: 2.6, opacidade: 0.35, pontos: semLimpa.map((r) => ({ x: r.n, y: r.te, deslocamento: 5 })) },
      { cor: COR.guloso, linha: true, rotulo: 'Guloso', pontos: porN.map(([n, g]) => ({ x: n, y: mediana(g.map((r) => r.tg)) })) },
      { cor: COR.exato, linha: true, rotulo: 'Exato (mediana)', ajusteRotulo: -4, pontos: porN.map(([n, g]) => ({ x: n, y: mediana(g.map((r) => r.te)), vazio: !g.every((r) => r.provado) })) },
      { cor: COR.limpa, linha: true, tracejado: true, rotulo: 'Exato, grade limpa', ajusteRotulo: 8, pontos: limpas.map((r) => ({ x: r.n, y: r.te, vazio: !r.provado })) },
    ],
  });
}

function figuraDispersao(an) {
  const pontos = an.completas.filter((r) => r.quadradosAposReducao > 0);
  const xMax = Math.max(...pontos.map((r) => r.quadradosAposReducao));
  const todos = pontos.map((r) => r.te);
  const yMin = 10 ** Math.floor(Math.log10(Math.min(...todos)));
  const ticksX = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].filter((t) => t <= xMax * 1.2);
  return grafico({
    x: { log: true, min: 0.8, max: xMax * 1.2, ticks: ticksX, rotulo: 'Quadrados vivos após as podas (escala log)', formatar: (t) => nf(t, 0) },
    y: { log: true, min: yMin, max: an.teto * 3, rotulo: 'Tempo do exato (escala log)', formatar: fmtTick },
    referencias: [{ y: an.teto, rotulo: `teto · ${an.teto / 1000} s` }],
    series: DIFICULDADES.map((dif) => ({
      cor: COR_DIFICULDADE[dif],
      raio: 4,
      pontos: pontos.filter((r) => r.dificuldade === dif).map((r) => ({ x: r.quadradosAposReducao, y: r.te, vazio: !r.provado })),
    })),
  });
}

function figuraNos(an) {
  const series = [];
  const todos = [];
  for (const dif of DIFICULDADES) {
    const pts = [];
    for (const n of an.tamanhos) {
      const g = an.porTamanhoDif.get(`${n}|${dif}`);
      if (!g) continue;
      // a contagem de uma busca cortada no teto mede a vazao da maquina, nao o tamanho da arvore
      if (!g.every((r) => r.provado)) break;
      const v = mediana(g.map((r) => Math.max(1, r.nos ?? 1)));
      pts.push({ x: n, y: v });
      todos.push(v);
    }
    series.push({ cor: COR_DIFICULDADE[dif], linha: true, rotulo: NOME_DIFICULDADE[dif], pontos: pts });
  }
  const nMin = an.tamanhos[0];
  const nMax = an.tamanhos[an.tamanhos.length - 1];
  return grafico({
    altura: 260,
    rotulosDiretos: true,
    x: { min: nMin - 0.5, max: nMax + 0.5, ticks: an.tamanhos, rotulo: 'Tamanho da grade (n × n)', formatar: (t) => `${t}` },
    y: { log: true, min: 1, max: 10 ** Math.ceil(Math.log10(Math.max(...todos) * 1.5)), rotulo: 'Nós explorados (log)', formatar: fmtTickNumero },
    series,
  });
}

function figuraExcesso(an) {
  const maxExc = Math.max(0, ...an.excessos);
  const categorias = [];
  const valores = [];
  for (let e = 0; e <= maxExc; e += 1) {
    categorias.push(e === 0 ? '0 (ótimo)' : `+${e}`);
    valores.push(an.excessos.filter((x) => x === e).length);
  }
  return graficoBarras({
    categorias, valores, cor: COR.guloso,
    rotuloX: 'Palitos a mais que o ótimo',
    rotuloY: 'Instâncias',
    rotuloValor: (v) => `${v}`,
  });
}

function figuraEscalaGuloso(an) {
  const { com, sem } = an.escalaGuloso;
  const todos = [...com.porN, ...sem.porN];
  if (!todos.length) return '<p class="aviso">Bancada C sem dados.</p>';
  const ns = [...new Set(todos.map((p) => p.n))].sort((a, b) => a - b);
  const tempos = todos.map((p) => p.t).filter((v) => v > 0);
  return grafico({
    rotulosDiretos: true,
    x: { log: true, min: ns[0] * 0.9, max: ns[ns.length - 1] * 1.12, ticks: ns.filter((n) => ![6, 10, 14, 28, 56].includes(n)), rotulo: 'Tamanho da grade (n × n, escala log)', formatar: (t) => `${t}` },
    y: { log: true, min: 10 ** Math.floor(Math.log10(Math.min(...tempos))), max: an.teto * 3, rotulo: 'Tempo total (escala log)', formatar: fmtTick },
    referencias: [{ y: an.teto, rotulo: `teto · ${an.teto / 1000} s` }],
    series: [
      { cor: COR.guloso, linha: true, rotulo: 'Com podas', pontos: com.porN.map((p) => ({ x: p.n, y: p.t })) },
      { cor: COR.exato, linha: true, rotulo: 'Sem podas', pontos: sem.porN.map((p) => ({ x: p.n, y: p.t })) },
    ],
  });
}

function tabelaTrintaSegundos(an) {
  const cab = DIFICULDADES.map((d) => `<th class="num">${NOME_DIFICULDADE[d]}</th>`).join('');
  const linhas = an.tamanhos.map((n) => `<tr><td>${n}×${n}</td>${DIFICULDADES.map((d) => {
    const g = an.porTamanhoDif.get(`${n}|${d}`) ?? [];
    return celulaFracao(g.filter((r) => r.provado).length, g.length);
  }).join('')}<td class="num">${(() => {
    const g = an.completas.filter((r) => r.n === n);
    return `${g.filter((r) => r.provado).length}/${g.length}`;
  })()}</td></tr>`);
  return `<table class="dados dados--compacta">
    <thead><tr><th>Grade</th>${cab}<th class="num">Total</th></tr></thead>
    <tbody>${linhas.join('')}</tbody></table>`;
}

function tabelaPodas(an) {
  const linhas = DIFICULDADES.map((dif) => {
    const g = an.completas.filter((r) => r.dificuldade === dif && r.quadradosVivos > 0);
    if (!g.length) return '';
    const fracQ = g.map((r) => 1 - r.quadradosAposReducao / r.quadradosVivos);
    const fracP = g.map((r) => 1 - r.palitosAposReducao / r.palitosRemoviveis);
    const zeradas = g.filter((r) => r.quadradosAposReducao === 0).length;
    const fatiaReducao = g.map((r) => r.tempos.reduzirMs / r.te);
    return `<tr><td>${NOME_DIFICULDADE[dif]}</td><td class="num">${g.length}</td>
      <td class="num">${pct(media(fracQ), 1)}</td><td class="num">${pct(media(fracP), 1)}</td>
      <td class="num">${nf(media(g.map((r) => r.obrigatorios)), 1)}</td>
      <td class="num">${zeradas} (${pct(zeradas / g.length)})</td>
      <td class="num">${pct(mediana(fatiaReducao), 1)}</td></tr>`;
  }).join('');
  return `<table class="dados dados--compacta">
    <thead><tr><th>Nível</th><th class="num">Inst.</th><th class="num">Quadrados<br>eliminados</th>
    <th class="num">Palitos<br>descartados</th><th class="num">Palitos<br>obrigatórios</th>
    <th class="num">Resolvidas só<br>pelas podas</th><th class="num">Parcela do tempo<br>nas podas (med.)</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function tabelaTamanhoInstancia() {
  const ns = [4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 32, 64];
  return `<table class="dados dados--compacta">
    <thead><tr><th>Grade</th>${ns.map((n) => `<th class="num">${n}</th>`).join('')}</tr></thead>
    <tbody>
      <tr><td>Palitos (m)</td>${ns.map((n) => `<td class="num">${nf(palitosDe(n), 0)}</td>`).join('')}</tr>
      <tr><td>Quadrados (q)</td>${ns.map((n) => `<td class="num">${nf(quadradosDe(n), 0)}</td>`).join('')}</tr>
    </tbody></table>`;
}

function tabelaQualidade(an) {
  const linhas = DIFICULDADES.map((dif) => {
    const g = an.provadas.filter((r) => r.dificuldade === dif);
    if (!g.length) return '';
    const exc = g.map((r) => r.guloso - r.otimo);
    const rel = g.map((r) => (r.guloso - r.otimo) / r.otimo);
    return `<tr><td>${NOME_DIFICULDADE[dif]}</td><td class="num">${g.length}</td>
      <td class="num">${pct(exc.filter((e) => e === 0).length / g.length)}</td>
      <td class="num">${nf(media(exc), 2)}</td><td class="num">${pct(media(rel), 1)}</td>
      <td class="num">+${maximo(exc)}</td><td class="num">${pct(maximo(rel), 1)}</td></tr>`;
  }).join('');
  return `<table class="dados dados--compacta">
    <thead><tr><th>Nível</th><th class="num">Inst. com<br>ótimo provado</th><th class="num">Guloso<br>atinge o ótimo</th>
    <th class="num">Excesso<br>médio</th><th class="num">Excesso<br>médio (%)</th><th class="num">Pior<br>excesso</th><th class="num">Pior<br>excesso (%)</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function tabelaApendice(an) {
  const linhas = an.completas
    .slice()
    .sort((a, b) => (a.n - b.n) || DIFICULDADES.indexOf(a.dificuldade) - DIFICULDADES.indexOf(b.dificuldade) || a.id.localeCompare(b.id))
    .map((r) => `<tr><td>${esc(r.id)}</td><td>${r.bancada}</td><td>${r.n}</td><td>${NOME_DIFICULDADE[r.dificuldade]}</td>
      <td class="num">${r.quadradosVivos}</td><td class="num">${r.quadradosAposReducao}</td>
      <td class="num">${r.guloso}</td><td class="num">${r.exato}${r.provado ? '' : '*'}</td>
      <td class="num">${r.cotaInferior ?? '—'}</td>
      <td class="num">${fmtTempo(r.tg)}</td><td class="num">${fmtTempo(r.te)}</td><td class="num">${fmtNumero(r.nos)}</td></tr>`)
    .join('');
  return `<table class="dados dados--apendice">
    <thead><tr><th>Instância</th><th>Banc.</th><th>n</th><th>Nível</th><th class="num">Quad.</th><th class="num">Após<br>podas</th>
    <th class="num">Guloso</th><th class="num">Exato</th><th class="num">Cota<br>inferior</th><th class="num">Tempo<br>guloso</th><th class="num">Tempo<br>exato</th><th class="num">Nós</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

// ---------------------------------------------------------------- documento

function montarHtml(dados, an, exemplo) {
  const amb = dados.ambiente;
  const teto = an.teto / 1000;
  const totalA = dados.instancias.A.length;
  const totalB = dados.instancias.B.length;
  const nsA = [...new Set(dados.instancias.A.map((r) => r.n))];
  const nsB = [...new Set(dados.instancias.B.map((r) => r.n))];
  const faixaB = nsB.length ? `${Math.min(...nsB)}×${Math.min(...nsB)} a ${Math.max(...nsB)}×${Math.max(...nsB)}` : '—';
  const lp = an.limiteProva;
  const li = an.limiteInterativo;
  const la = an.limiteAceitavel;
  const fmtN = (n) => (n ? `${n}×${n}` : 'nenhum tamanho');
  const g = an.escalaGuloso;
  const provadasTotal = an.provadas.length;
  const totalCompletas = an.completas.length;
  const dataRel = new Date(amb.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const medRazao = mediana(an.razaoTempos);
  const pctOtimo = provadasTotal ? an.gulosoOtimo / provadasTotal : 0;

  // limpa de 7x7: pior caso ainda provado dentro das bancadas do jogo
  const limpas = an.completas.filter((r) => r.dificuldade === 'limpa').sort((a, b) => a.n - b.n);
  const maiorLimpaProvada = limpas.filter((r) => r.provado).pop();
  const primeiraLimpaFalha = limpas.find((r) => !r.provado);

  let fig = 0;
  let tab = 0;
  const figura = (conteudo, legenda, legendaCores = '') => {
    fig += 1;
    return `<figure>${legendaCores}${conteudo}<figcaption><b>Figura ${fig}</b> — ${legenda}</figcaption></figure>`;
  };
  const tabela = (conteudo, legenda, nota = '') => {
    tab += 1;
    return `<div class="tabela"><p class="tabela__titulo"><b>Tabela ${tab}</b> — ${legenda}</p>${conteudo}${nota ? `<p class="nota">${nota}</p>` : ''}</div>`;
  };

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Broken Grid — Avaliação Experimental dos Algoritmos</title>
<style>${CSS}</style></head>
<body>

<header class="capa">
  <p class="instituicao">Universidade do Estado de Santa Catarina — UDESC · Projeto Integrador I</p>
  <h1>Broken Grid: avaliação experimental<br>dos algoritmos de solução</h1>
  <p class="subtitulo">Desempenho do algoritmo guloso e do algoritmo exato (<i>branch and bound</i>)
  em instâncias de dificuldade e tamanho crescentes</p>
  <p class="meta">Relatório de testes · ${dataRel}</p>
</header>

<section class="resumo">
  <h2 class="sem-numero">Resumo</h2>
  <p>Este relatório avalia os dois algoritmos que calculam a solução de referência do <i>Broken Grid</i>:
  um <b>guloso</b>, que produz uma resposta aproximada quase instantânea, e um <b>exato</b> por
  <i>branch and bound</i>, que prova o número mínimo de palitos. Foram executadas <b>${totalCompletas} instâncias</b>
  em ${an.tamanhos.length} tamanhos de grade (${an.tamanhos[0]}×${an.tamanhos[0]} a ${an.tamanhos[an.tamanhos.length - 1]}×${an.tamanhos[an.tamanhos.length - 1]}),
  classificadas em três níveis de dificuldade mais o pior caso (grade sem palitos quebrados ou bloqueados).
  Cada instância recebeu um teto de ${teto} segundos.</p>
  <ul>
    <li>O exato provou o ótimo em <b>${provadasTotal} de ${totalCompletas}</b> instâncias.
    Em todas as grades do jogo (4×4 a 7×7) ele termina dentro do teto; a grade limpa
    ${maiorLimpaProvada ? `${maiorLimpaProvada.n}×${maiorLimpaProvada.n} leva ${fmtTempo(maiorLimpaProvada.te)}` : ''}${primeiraLimpaFalha ? ` e a ${primeiraLimpaFalha.n}×${primeiraLimpaFalha.n} já não é provada em ${teto} s` : ''}.</li>
    <li><b>A dificuldade pesa mais que o tamanho.</b> Com ${teto} s, todas as instâncias foram provadas até
    ${fmtN(lp.facil)} no nível fácil, ${fmtN(lp.medio)} no médio e ${fmtN(lp.dificil)} no difícil.
    O que prevê o tempo é o número de quadrados que sobram após as podas, não o <i>n</i> da grade.</li>
    <li>O guloso nunca foi o gargalo: ele responde em menos de ${fmtTempo(maximo(an.completas.map((r) => r.tg)))} em
    todas as ${totalCompletas} instâncias e continua abaixo de ${teto} s até ${fmtN(g.com.maiorN)}, o maior tamanho medido
    (mediana de ${fmtTempo(g.com.porN.at(-1)?.t)} com as podas e ${fmtTempo(g.sem.porN.at(-1)?.t)} sem elas).</li>
    <li>O guloso atinge o ótimo em <b>${pct(pctOtimo)}</b> das instâncias com ótimo provado; em média usa
    ${nf(media(an.excessos) ?? 0, 2)} palito a mais (${pct(media(an.excessoRel) ?? 0, 1)}), chegando a +${maximo(an.excessos) ?? 0}.
    Nas grades grandes o erro cresce: onde a prova não terminou, o exato ainda assim melhorou o guloso em até
    ${maximo(an.melhoriaSobreGuloso) ?? 0} palitos. É essa diferença que justifica manter o exato no jogo.</li>
  </ul>
</section>

<h2>O problema</h2>
<p>Uma grade <i>n</i>×<i>n</i> tem <i>m</i> = 2<i>n</i>(<i>n</i>+1) palitos e
<i>q</i> = <i>n</i>(<i>n</i>+1)(2<i>n</i>+1)/6 quadrados possíveis — de 1×1 até o próprio <i>n</i>×<i>n</i>.
Cada palito está em um de três estados: <b>removível</b>, <b>bloqueado</b> (não pode ser removido) ou
<b>quebrado</b> (já ausente desde o início). Um quadrado está <i>vivo</i> enquanto todos os seus lados estão presentes.
O jogador vence quando não resta nenhum quadrado vivo, e o objetivo é fazê-lo removendo o menor número de palitos.</p>
<p>Formalmente, trata-se do problema de <b>cobertura mínima de conjuntos</b> (<i>minimum set cover</i>),
NP-difícil: o universo são os quadrados vivos, e cada palito removível "cobre" os quadrados de que faz parte.
Remover um conjunto de palitos quebra todos os quadrados se e somente se esse conjunto cobre o universo.
A Tabela ${tab + 1} mostra como a instância cresce com <i>n</i>: o número de quadrados cresce com <i>n</i>³.</p>
${tabela(tabelaTamanhoInstancia(), 'Tamanho da instância por grade (valores para a grade limpa).')}
${figura(`<div class="exemplo">${desenharGrade(exemplo.config, exemplo.solucao)}${legendaHtml([
    { cor: '#a9b8c9', rotulo: 'Removível' },
    { cor: '#1f1f1d', rotulo: 'Bloqueado' },
    { cor: '#c9c7c1', forma: 'vazio', rotulo: 'Quebrado (ausente)' },
    { cor: COR.exato, rotulo: `Solução ótima (${exemplo.solucao.length} palitos)` },
  ])}</div>`, `Instância <code>${exemplo.id}</code> do jogo (4×4) com a solução ótima calculada pelo exato.`)}

<h2>Os algoritmos</h2>
<p>O <i>solver</i> (<code>src/solver/</code>) roda em três etapas. As duas primeiras formam o algoritmo guloso;
o exato usa o resultado do guloso como ponto de partida. A instância é compilada em máscaras de bits
(<code>Uint32Array</code>): para cada quadrado, os palitos que o cobrem; para cada palito, os quadrados que cobre.
Assim, união, interseção e contagem viram operações sobre palavras de 32 bits.</p>

<h3>Pré-processamento: podas de redução</h3>
<p>Antes de qualquer busca, três regras são aplicadas repetidamente até que nenhuma mude a instância
(<code>reduzirInstancia</code>, em <code>instancia.js</code>):</p>
<ol>
  <li><b>Palito obrigatório:</b> se um quadrado vivo tem um único lado removível, esse palito entra
  obrigatoriamente na solução, e todos os quadrados que ele cobre saem do universo.</li>
  <li><b>Quadrado dominado:</b> se todo palito que quebra o quadrado B também quebra o quadrado A, basta
  garantir B — A é descartado.</li>
  <li><b>Palito dominado:</b> se o palito P cobre um subconjunto dos quadrados cobertos pelo palito R,
  escolher R nunca é pior — P é descartado.</li>
</ol>
<p>Cada passada custa O(<i>q</i>²·⌈<i>m</i>/32⌉ + <i>m</i>²·⌈<i>q</i>/32⌉) — polinomial, mas quadrática no número de quadrados,
o que se torna relevante em grades grandes (ver “Efeito das podas de redução”, nos Resultados).</p>

<h3>Algoritmo guloso</h3>
<p>Repete: escolhe o palito que quebra o <b>maior número de quadrados ainda vivos</b>, até não restar nenhum.
Em seguida faz uma poda reversa: tenta retirar cada palito escolhido e, se a cobertura continua completa,
o descarta. Custa O(<i>k</i>·<i>m</i>·⌈<i>q</i>/32⌉), com <i>k</i> o tamanho da solução. Para cobertura de conjuntos,
o guloso garante no máximo H(Δ) ≈ ln Δ vezes o ótimo, com Δ o maior número de quadrados cobertos por um só palito.
Na prática fica bem mais perto (ver “Qualidade do guloso”, nos Resultados), mas <b>não prova</b> que a resposta é mínima.</p>

<h3>Algoritmo exato: <i>branch and bound</i></h3>
<p>Uma busca em profundidade com pilha explícita (<code>prepararBusca</code>, em <code>exato.js</code>).
Em cada nó, escolhe o quadrado vivo com <b>menos lados disponíveis</b> (o mais restrito) e ramifica sobre cada palito
que o quebra, na ordem dos que quebram mais quadrados. Um ramo é cortado quando</p>
<p class="formula">palitos já escolhidos + cota inferior ≥ melhor solução conhecida</p>
<p>A <b>cota inferior</b> conta quadrados vivos <b>disjuntos</b> — sem nenhum palito em comum —, escolhidos
gulosamente dos mais restritos para os menos. Cada um exige um palito diferente, então a solução restante
tem pelo menos essa quantidade. O teto inicial é a solução do guloso: se a busca esgota a árvore sem achar nada
menor, o guloso já era ótimo — e agora está <b>provado</b>. O pior caso é exponencial no tamanho da solução.
No jogo, a busca roda em fatias de 8 ms para não travar a interface, com orçamento de 100 ms (4×4 a 6×6)
ou 2 s (7×7); se o orçamento acaba, a tela exibe a melhor solução como "aproximada".</p>

<h2>Metodologia</h2>

<h3>Instâncias e níveis de dificuldade</h3>
<p>O experimento usa duas bancadas de instâncias completas (guloso e exato) e uma terceira só para o guloso:</p>
<ul>
  <li><b>Bancada A — grades do jogo (${totalA} instâncias).</b> As ${totalA - nsA.length} grades versionadas em
  <code>data/grids/</code> (20 por tamanho, de 4×4 a 7×7), mais a grade limpa de cada tamanho. O nível vem do
  próprio dataset: é a razão <i>r</i> entre o mínimo da grade e o mínimo da grade limpa do mesmo tamanho —
  fácil se <i>r</i> ≤ 0,58, médio se <i>r</i> ≤ 0,75, difícil acima disso.</li>
  <li><b>Bancada B — extrapolação (${totalB} instâncias).</b> Grades de ${faixaB}, geradas com semente fixa pelo
  mesmo gerador do dataset (<code>gerarGrade</code>), ${dados.parametros.porPerfilB} por nível, mais a grade limpa de cada tamanho.
  Aqui a razão <i>r</i> não pode ser usada, porque o mínimo da grade limpa deixa de ser provável dentro do teto
  a partir de 8×8. O nível é então dado pelo <b>perfil de geração</b>: fácil (20% de palitos quebrados, 30% bloqueados),
  médio (12%, 25% — o perfil do dataset) e difícil (5%, 20%). Menos palitos quebrados significa mais quadrados vivos.</li>
  <li><b>Bancada C — escala do guloso.</b> Três grades de perfil médio por tamanho, de 4×4 até 64×64, com e sem
  as podas, parando no primeiro tamanho que estoura o teto.${dados.parametros.bancadaC ? ` A execução foi interrompida pelo ambiente,
  por falta de memória no sistema, ao iniciar a grade ${dados.parametros.bancadaC.interrompidaEm}×${dados.parametros.bancadaC.interrompidaEm};
  os resultados até ${dados.parametros.bancadaC.ultimoTamanhoCompleto}×${dados.parametros.bancadaC.ultimoTamanhoCompleto} vêm do log da execução,
  que registra o tempo total e o tamanho da solução de cada medição (sem a validação de solução das bancadas A e B).` : ''}</li>
</ul>
<p>O gerador garante que toda instância tem solução: ele sorteia um corte válido antes de marcar palitos como bloqueados
e nunca bloqueia um palito desse corte.</p>

<h3>Métricas e critérios</h3>
<ul>
  <li><b>Tempo do guloso</b> = compilação + podas + guloso — o que o jogador espera pela primeira resposta.</li>
  <li><b>Tempo do exato</b> = tempo do guloso + busca, até provar o ótimo ou atingir o teto de ${teto} s.
  Instâncias não provadas aparecem nos gráficos com marcador vazado, no teto.</li>
  <li><b>Nós explorados</b> pela busca, <b>cota inferior</b> na raiz e <b>excesso do guloso</b>
  (palitos do guloso − ótimo provado).</li>
  <li>Faixas de tempo: <b>interativo</b> ≤ 100 ms (orçamento do jogo até 6×6), <b>aceitável</b> ≤ 2 s
  (orçamento do 7×7) e <b>limite</b> = ${teto} s.</li>
</ul>
<p>Toda solução produzida — gulosa e exata — foi <b>validada de forma independente</b>, remontando a grade e
removendo os palitos; ${an.completas.every((r) => r.gulosoValido !== false && r.exatoValido !== false) ? 'todas quebraram todos os quadrados usando apenas palitos removíveis' : '<b>houve soluções inválidas</b> (ver apêndice)'}.
Cada instância rodou isolada em um <i>worker thread</i>, em sequência, sem outra carga de medição concorrente.</p>

<h3>Ambiente</h3>
<p>${esc(amb.cpu)} (${amb.nucleos} núcleos lógicos), ${nf(amb.memoriaGB, 1)} GB de RAM, ${esc(amb.so)}, Node.js ${esc(amb.node)}.
Execução das bancadas A e B: ${nf(dados.duracaoMs / 60000, 0)} min${dados.parametros.bancadaC ? '' : ', incluindo a C'}. Para reproduzir:</p>
<pre>node tools/benchmark-solver.mjs      # mede e grava docs/dados/benchmark-solver.json
node tools/relatorio-pdf.mjs         # gera este PDF a partir do JSON</pre>

<h2>Resultados</h2>

<h3>Grades do jogo (bancada A)</h3>
<p>Nos quatro tamanhos oferecidos no jogo, o exato prova o ótimo em todas as instâncias.
A mediana do exato fica abaixo de 100 ms até ${fmtN(Math.min(li.facil ?? 0, li.medio ?? 0, li.dificil ?? 0) || null)} em todos os níveis,
e o pior caso real do jogo é a grade limpa.</p>
${tabela(tabelaPorTamanho(an, 'A'), `Bancada A — desempenho por tamanho e nível (tempos com teto de ${teto} s).`,
    '“Excesso do guloso”: média de palitos a mais que o ótimo, só entre instâncias com ótimo provado. Células da coluna “Provadas” sombreadas pela fração provada.')}

<h3>Extrapolação para grades maiores (bancada B)</h3>
${tabela(tabelaPorTamanho(an, 'B'), `Bancada B — desempenho por tamanho e nível (tempos com teto de ${teto} s).`,
    'Instâncias não provadas contam no tempo com o valor do teto; por isso a mediana satura em 30 s quando a maioria não é provada.')}

<h3>Tempo em função do tamanho</h3>
<p>A Figura ${fig + 1} junta as duas bancadas. O guloso cresce de forma suave, polinomial. O exato acompanha o guloso
nas grades pequenas — a busca termina em poucos nós porque as podas e a cota inferior já fecham a instância — e então dá
um salto de várias ordens de grandeza, típico de busca exponencial. A grade limpa marca o pior caso de cada tamanho.</p>
${figura(figuraTempoPorTamanho(an), `Tempo mediano por tamanho de grade (sem as grades limpas), com cada instância do exato em pontos claros. Marcador vazado: mediana com instâncias não provadas no teto.`,
    legendaHtml([
      { cor: COR.guloso, forma: 'linha', rotulo: 'Guloso (mediana)' },
      { cor: COR.exato, forma: 'linha', rotulo: 'Exato (mediana)' },
      { cor: COR.limpa, forma: 'linha', tracejado: true, rotulo: 'Exato, grade limpa' },
      { cor: COR.exato, forma: 'vazio', rotulo: 'Não provado no teto' },
    ]))}

<h3>Dificuldade versus tamanho</h3>
<p>A Figura ${fig + 1} mostra por que o tamanho sozinho não explica o tempo: cada ponto é uma instância, e o eixo horizontal é o
número de quadrados que <b>sobram depois das podas</b>. Instâncias de tamanhos diferentes se alinham na mesma faixa.
Uma grade grande e fácil pode ter menos quadrados relevantes que uma pequena e difícil — e é resolvida mais rápido.
${an.transicao ? `Toda instância com menos de ${an.transicao.abaixoTodas} quadrados após as podas foi provada, e nenhuma com mais de
${an.transicao.acimaNenhuma} foi. Entre esses valores fica uma zona de transição (${an.transicao.naZona.length} instâncias,
${an.transicao.naZona.filter((r) => r.provado).length} provadas), em que a estrutura da instância — quanto os quadrados
compartilham palitos — decide o resultado.` : ''}</p>
${figura(figuraDispersao(an), 'Tempo do exato por instância em função dos quadrados vivos após as podas (bancadas A e B). Marcador vazado: não provado no teto.',
    legendaHtml([...DIFICULDADES.map((d) => ({ cor: COR_DIFICULDADE[d], rotulo: NOME_DIFICULDADE[d] })), { cor: COR_DIFICULDADE.dificil, forma: 'vazio', rotulo: 'Não provado' }]))}

${figura(figuraNos(an), 'Mediana de nós explorados pelo exato até provar o ótimo, por tamanho e nível. Cada linha para no último tamanho em que todas as instâncias do nível foram provadas: numa busca cortada pelo teto, a contagem mede a velocidade da máquina, não o tamanho da árvore.',
    legendaHtml(DIFICULDADES.map((d) => ({ cor: COR_DIFICULDADE[d], forma: 'linha', rotulo: NOME_DIFICULDADE[d] }))))}

<h3>Teste dos ${teto} segundos</h3>
<p>A Tabela ${tab + 1} responde diretamente até que tamanho cada algoritmo entrega dentro de ${teto} s.
O guloso entrega sempre — em todas as instâncias das bancadas A e B ele respondeu em menos de ${fmtTempo(maximo(an.completas.map((r) => r.tg)))}.
A pergunta relevante é para o exato: em quantas instâncias ele <b>prova</b> o ótimo dentro do teto.</p>
${tabela(tabelaTrintaSegundos(an), `Instâncias com ótimo provado em até ${teto} s, por tamanho e nível.`)}
<div class="destaques">
  <div><span class="destaque__valor">${fmtN(lp.facil)}</span><span class="destaque__rotulo">maior grade <b>fácil</b> com todas as instâncias provadas em ${teto} s</span></div>
  <div><span class="destaque__valor">${fmtN(lp.medio)}</span><span class="destaque__rotulo">maior grade <b>média</b> com todas provadas</span></div>
  <div><span class="destaque__valor">${fmtN(lp.dificil)}</span><span class="destaque__rotulo">maior grade <b>difícil</b> com todas provadas</span></div>
  <div><span class="destaque__valor">${fmtN(lp.limpa)}</span><span class="destaque__rotulo">maior <b>grade limpa</b> provada (pior caso)</span></div>
</div>
<p class="nota">Os destaques usam o maior tamanho com <b>todos</b> os tamanhos até ele provados.${an.retornos.length ? ` Alguns tamanhos maiores voltaram a ter
todas as instâncias provadas (${an.retornos.map((r) => `${NOME_DIFICULDADE[r.dif].toLowerCase()} ${r.n}×${r.n}`).join(', ')}) — mais uma evidência de que
a instância sorteada pesa mais que o tamanho.` : ''}</p>
<p>Com o critério mais estrito de tempo <b>interativo</b> (mediana ≤ 100 ms e todas provadas), os limites são
${fmtN(li.facil)} (fácil), ${fmtN(li.medio)} (médio), ${fmtN(li.dificil)} (difícil) e ${fmtN(li.limpa)} (grade limpa);
com o critério <b>aceitável</b> (≤ 2 s), ${fmtN(la.facil)}, ${fmtN(la.medio)}, ${fmtN(la.dificil)} e ${fmtN(la.limpa)}.</p>
${an.naoProvadas.length ? `<p>Mesmo quando não prova, o exato continua útil como otimizador: nas ${an.naoProvadas.length} instâncias não provadas,
a busca melhorou a solução do guloso em ${nf(media(an.melhoriaSobreGuloso), 1)} ${media(an.melhoriaSobreGuloso) >= 2 ? 'palitos' : 'palito'} em média (até ${maximo(an.melhoriaSobreGuloso)}).
A distância entre a melhor solução encontrada e a cota inferior da raiz ficou em ${pct(mediana(an.lacunas), 0)} na mediana —
é o quanto, no máximo, a resposta pode estar acima do ótimo verdadeiro.</p>` : ''}

<h3>Qualidade do guloso em relação ao ótimo</h3>
<p>Nas ${provadasTotal} instâncias com ótimo provado, o tempo do exato foi em mediana ${nf(medRazao ?? 0, 1)} vezes o do guloso.
O que se ganha com esse custo aparece na Figura ${fig + 1} e na Tabela ${tab + 1}.</p>
${figura(figuraExcesso(an), `Distribuição do excesso do guloso sobre o ótimo, nas ${provadasTotal} instâncias com ótimo provado.`)}
${tabela(tabelaQualidade(an), 'Qualidade do guloso por nível de dificuldade (apenas instâncias com ótimo provado).')}
${(() => {
  const porNivel = ['facil', 'medio', 'dificil'].map((d) => media(an.provadas.filter((r) => r.dificuldade === d).map((r) => r.guloso - r.otimo))).filter((v) => v !== null);
  const limpa = media(an.provadas.filter((r) => r.dificuldade === 'limpa').map((r) => r.guloso - r.otimo));
  return `<p>Entre os níveis fácil, médio e difícil, o excesso médio fica numa faixa estreita (${nf(Math.min(...porNivel), 2)} a
  ${nf(Math.max(...porNivel), 2)} palito); a grade limpa se destaca, com ${nf(limpa ?? 0, 2)}. A tabela não mostra o excesso crescendo
  com o nível por um <b>viés de seleção</b>: só existe ótimo provado para as instâncias difíceis pequenas, e é nas grandes que o
  guloso mais erra. As instâncias não provadas confirmam isso: nelas o exato melhorou a solução do guloso em
  ${nf(media(an.melhoriaSobreGuloso) ?? 0, 1)} palitos em média, até ${maximo(an.melhoriaSobreGuloso) ?? 0}. A causa é estrutural: o guloso escolhe
  o palito que quebra mais quadrados <i>agora</i>, sem enxergar que outro palito tornaria escolhas futuras desnecessárias.</p>
  <p>Isso afeta diretamente a métrica de eficiência do jogo: se o guloso fosse a referência, o jogador poderia remover
  menos palitos que o “mínimo” exibido, e a eficiência passaria de 100%. O exato impede isso.</p>`;
})()}

<h3>Efeito das podas de redução</h3>
${tabela(tabelaPodas(an), 'Efeito do pré-processamento por nível (bancadas A e B, médias por instância).',
    '“Resolvidas só pelas podas”: instâncias em que nenhum quadrado sobrou para a busca — os palitos obrigatórios já são a solução ótima.')}
<p>As podas são o que torna as grades fáceis triviais: com muitos palitos quebrados, vários quadrados ficam com um único lado
removível, e a cadeia de palitos obrigatórios se propaga. Nas grades limpas elas não eliminam nenhum quadrado — todos têm
todos os lados disponíveis e nenhum domina outro — e descartam só alguns palitos dominados.</p>
<p>Em grades muito grandes as podas passam a ter custo próprio. A Figura ${fig + 1} (bancada C) compara o guloso com e sem elas.</p>
${figura(figuraEscalaGuloso(an), `Tempo total do guloso por tamanho, com e sem as podas (bancada C, mediana de 3 grades de perfil médio).`,
    legendaHtml([{ cor: COR.guloso, forma: 'linha', rotulo: 'Com podas' }, { cor: COR.exato, forma: 'linha', rotulo: 'Sem podas' }]))}
<p>Em todos os tamanhos a versão sem podas é mais rápida, e a diferença cresce: em ${fmtN(g.com.maiorN)} são
${fmtTempo(g.com.porN.at(-1)?.t)} com as podas contra ${fmtTempo(g.sem.porN.at(-1)?.t)} sem elas. As soluções ficam praticamente iguais
(${nf(g.com.porN.at(-1)?.guloso ?? 0, 0)} e ${nf(g.sem.porN.at(-1)?.guloso ?? 0, 0)} palitos, na mediana). O custo quadrático das podas em <i>q</i> domina nas
grades grandes; para o exato, porém, elas se pagam com folga, porque cada quadrado eliminado antes da busca encolhe a árvore exponencial.</p>
${g.com.primeiroEstouro || g.sem.primeiroEstouro ? '' : `<p>Nenhuma das duas variantes atingiu o teto de ${teto} s até ${fmtN(g.com.maiorN)}, o maior tamanho medido${dados.parametros.bancadaC ? ` — a execução foi interrompida pelo ambiente, por falta de memória, ao iniciar ${fmtN(dados.parametros.bancadaC.interrompidaEm)}` : ''}.
${g.com.expoente ? `Entre os dois maiores tamanhos medidos, o tempo cresceu como <i>n</i><sup>${nf(g.com.expoente, 1)}</sup> com as podas e
<i>n</i><sup>${nf(g.sem.expoente, 1)}</sup> sem elas. Extrapolando esse ritmo — uma estimativa, não uma medição —, o guloso com podas
chegaria a ${teto} s por volta de ${nf(g.com.nNoTeto, 0)}×${nf(g.com.nNoTeto, 0)}, e sem podas por volta de ${nf(g.sem.nNoTeto, 0)}×${nf(g.sem.nNoTeto, 0)}.
Nessa escala, a memória tende a limitar antes do tempo: uma grade 64×64 tem ${nf(quadradosDe(64), 0)} quadrados.` : ''}</p>`}

<h2>Discussão</h2>
<p><b>Onde o desempenho degrada.</b> O guloso é polinomial e nunca limitou os experimentos com o exato.
O exato tem dois regimes. Enquanto as podas e a cota inferior fecham a instância, ele custa quase o mesmo que o guloso.
Quando sobram quadrados demais após as podas, a árvore explode, e o tempo passa de milissegundos para o teto
num intervalo curto — visível tanto na Figura 2 quanto na Figura 3.</p>
<p><b>Implicação para o jogo.</b> Os orçamentos atuais (100 ms até 6×6, 2 s no 7×7) são coerentes com as medições:
todas as grades do jogo são provadas bem dentro deles, e o rótulo “ótima” exibido ao jogador é honesto.
${(() => {
  const d8 = an.porTamanhoDif.get('8|dificil') ?? [];
  return `Oferecer 8×8 no jogo exigiria aceitar soluções “aproximadas” em parte das grades — ${d8.length ? `só ${d8.filter((r) => r.provado).length} das
  ${d8.length} grades difíceis 8×8 foram provadas em ${teto} s, e ` : ''}a grade limpa 8×8 não foi — ou fortalecer a cota inferior.</p>`;
})()}
<p><b>Caminhos de melhoria</b>, se grades maiores forem desejadas: uma cota inferior mais forte (por relaxação linear, ou
empacotamento de quadrados com pesos); memorização de subproblemas repetidos; e podas incrementais dentro da busca,
reaplicando as regras de redução a cada nó.</p>

<h3>Ameaças à validade</h3>
<ul>
  <li><b>Uma única máquina.</b> Os tempos absolutos dependem do processador. O ${esc(amb.cpu)} mistura núcleos de desempenho
  e de eficiência, e o sistema operacional pode agendar a medição em qualquer um deles — por isso usamos medianas.
  As tendências relativas (guloso × exato, fácil × difícil) não dependem disso.</li>
  <li><b>Node.js, não o navegador.</b> O jogo roda o mesmo código no navegador, com o mesmo motor V8 (no Chrome);
  a busca fatiada do jogo acrescenta um pequeno custo de alternância que não aparece aqui.</li>
  <li><b>Dois critérios de dificuldade.</b> A bancada A usa o critério do dataset; a B, o perfil de geração. Os níveis
  são comparáveis dentro de cada bancada, mas não exatamente entre elas. Por isso a Figura 3 usa uma medida objetiva
  — os quadrados após as podas — que vale para as duas.</li>
  <li><b>Amostra por tamanho.</b> Na bancada B há ${dados.parametros.porPerfilB} instâncias por nível e tamanho; os limites
  por nível devem ser lidos como aproximados (±1 no tamanho).</li>
</ul>

<h2>Conclusão</h2>
<p>O guloso é rápido em qualquer tamanho testado e fica, em média, a ${nf(media(an.excessos) ?? 0, 2)} palito do ótimo — suficiente
como primeira resposta, insuficiente como referência de avaliação do jogador. O exato prova o ótimo em todas as grades do
jogo, com folga em relação ao orçamento de tempo, e continua viável em grades maiores enquanto a instância, depois das podas,
permanece pequena. O limite de desempenho do exato é dado pela <b>dificuldade</b> da instância — quadrados que sobram após as
podas — e não apenas pelo tamanho da grade: com ${teto} s, ele prova grades fáceis até ${fmtN(lp.facil)}, mas grades difíceis
só até ${fmtN(lp.dificil)} e a grade limpa só até ${fmtN(lp.limpa)}.</p>

<h2 class="quebra">Apêndice — resultados por instância</h2>
<p class="nota">* ótimo não provado dentro do teto: o valor é a melhor solução encontrada. “Cota inferior” é a da raiz da busca,
incluindo os palitos obrigatórios.</p>
${tabelaApendice(an)}

</body></html>`;
}

// ---------------------------------------------------------------- anexo de dados

const ms2 = (v) => (v === null || v === undefined ? '—' : nf(v, 2));

function tabelaInstanciasCompleta(an) {
  const linhas = an.completas
    .slice()
    .sort((a, b) => a.bancada.localeCompare(b.bancada) || (a.n - b.n)
      || DIFICULDADES.indexOf(a.dificuldade) - DIFICULDADES.indexOf(b.dificuldade) || a.id.localeCompare(b.id))
    .map((r) => `<tr${r.provado ? '' : ' class="nao-provada"'}><td>${esc(r.id)}</td><td>${r.bancada}</td><td class="num">${r.n}</td><td>${NOME_DIFICULDADE[r.dificuldade]}</td>
      <td class="num">${r.quebrados}</td><td class="num">${r.bloqueados}</td><td class="num">${r.palitosRemoviveis}</td>
      <td class="num">${r.quadradosVivos}</td><td class="num">${r.quadradosAposReducao}</td><td class="num">${r.palitosAposReducao}</td>
      <td class="num">${r.obrigatorios}</td><td class="num">${r.guloso}</td><td class="num">${r.exato}</td><td>${r.provado ? 'sim' : 'não'}</td>
      <td class="num">${r.cotaInferior ?? '—'}</td>
      <td class="num">${ms2(r.tempos.compilarMs)}</td><td class="num">${ms2(r.tempos.reduzirMs)}</td><td class="num">${ms2(r.tempos.gulosoMs)}</td>
      <td class="num">${ms2(r.tempos.exatoMs)}</td><td class="num">${ms2(r.tg)}</td><td class="num">${ms2(r.te)}</td>
      <td class="num">${r.nos === null ? '—' : nf(r.nos, 0)}</td></tr>`)
    .join('');
  return `<table class="dados dados--bruta">
    <thead><tr>
      <th rowspan="2">Instância</th><th rowspan="2">B.</th><th rowspan="2" class="num">n</th><th rowspan="2">Nível</th>
      <th colspan="3" class="grupo">Palitos</th><th colspan="2" class="grupo">Quadrados vivos</th><th colspan="2" class="grupo">Podas</th>
      <th colspan="4" class="grupo">Solução (palitos)</th><th colspan="6" class="grupo">Tempo (ms)</th><th rowspan="2" class="num">Nós</th>
    </tr><tr>
      <th class="num">queb.</th><th class="num">bloq.</th><th class="num">remov.</th>
      <th class="num">início</th><th class="num">após</th>
      <th class="num">palitos<br>restantes</th><th class="num">obrig.</th>
      <th class="num">guloso</th><th class="num">exato</th><th>prov.</th><th class="num">cota<br>inf.</th>
      <th class="num">compilar</th><th class="num">podas</th><th class="num">guloso</th><th class="num">busca</th>
      <th class="num">total<br>guloso</th><th class="num">total<br>exato</th>
    </tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function tabelaEscalaCompleta(an) {
  const porN = agrupar(an.C, (r) => r.n);
  const linhas = [...porN].sort((a, b) => a[0] - b[0]).map(([n, g]) => {
    const com = g.filter((r) => r.variante === 'com').sort((a, b) => a.id.localeCompare(b.id));
    const sem = g.filter((r) => r.variante === 'sem').sort((a, b) => a.id.localeCompare(b.id));
    const tempos = (lista) => lista.map((r) => (r.estourou ? 'estourou' : ms2(r.totalMs))).join(' · ');
    return `<tr><td>${n}×${n}</td><td class="num">${nf(palitosDe(n), 0)}</td><td class="num">${nf(quadradosDe(n), 0)}</td>
      <td class="num">${com.map((r) => nf(r.quadradosVivos, 0)).join(' · ')}</td>
      <td class="num">${tempos(com)}</td><td class="num"><b>${ms2(mediana(com.map((r) => r.totalMs)))}</b></td>
      <td class="num">${com.map((r) => nf(r.guloso, 0)).join(' · ')}</td>
      <td class="num">${tempos(sem)}</td><td class="num"><b>${ms2(mediana(sem.map((r) => r.totalMs)))}</b></td>
      <td class="num">${sem.map((r) => nf(r.guloso, 0)).join(' · ')}</td></tr>`;
  }).join('');
  return `<table class="dados dados--bruta">
    <thead><tr>
      <th rowspan="2">Grade</th><th colspan="2" class="grupo">Grade limpa</th><th rowspan="2" class="num">Quadrados vivos<br>(3 grades)</th>
      <th colspan="3" class="grupo">Com podas</th><th colspan="3" class="grupo">Sem podas</th>
    </tr><tr>
      <th class="num">palitos</th><th class="num">quadrados</th>
      <th class="num">tempo total (ms)</th><th class="num">mediana</th><th class="num">solução</th>
      <th class="num">tempo total (ms)</th><th class="num">mediana</th><th class="num">solução</th>
    </tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function tabelaResumoPorNivel(an) {
  const linhas = DIFICULDADES.map((dif) => {
    const g = an.completas.filter((r) => r.dificuldade === dif);
    if (!g.length) return '';
    const prov = g.filter((r) => r.provado);
    return `<tr><td>${NOME_DIFICULDADE[dif]}</td><td class="num">${g.length}</td><td class="num">${prov.length} (${pct(prov.length / g.length)})</td>
      <td class="num">${ms2(mediana(g.map((r) => r.tg)))}</td><td class="num">${ms2(maximo(g.map((r) => r.tg)))}</td>
      <td class="num">${ms2(mediana(prov.map((r) => r.te)))}</td><td class="num">${ms2(maximo(prov.map((r) => r.te)))}</td>
      <td class="num">${prov.length ? nf(mediana(prov.map((r) => r.nos)), 0) : '—'}</td>
      <td class="num">${an.limiteProva[dif] ? `${an.limiteProva[dif]}×${an.limiteProva[dif]}` : '—'}</td></tr>`;
  }).join('');
  return `<table class="dados dados--compacta">
    <thead><tr><th>Nível</th><th class="num">Inst.</th><th class="num">Provadas<br>em ${an.teto / 1000} s</th>
    <th class="num">Guloso: mediana<br>(ms)</th><th class="num">Guloso:<br>máximo (ms)</th>
    <th class="num">Exato provado:<br>mediana (ms)</th><th class="num">Exato provado:<br>máximo (ms)</th>
    <th class="num">Nós (mediana,<br>provadas)</th><th class="num">Maior n com<br>todas provadas</th></tr></thead>
    <tbody>${linhas}</tbody></table>`;
}

function montarHtmlDados(dados, an) {
  const amb = dados.ambiente;
  const par = dados.parametros;
  const teto = an.teto / 1000;
  const dataRel = new Date(amb.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  let tab = 0;
  const tabela = (conteudo, legenda, nota = '') => {
    tab += 1;
    return `<div class="tabela"><p class="tabela__titulo"><b>Tabela D${tab}</b> — ${legenda}</p>${conteudo}${nota ? `<p class="nota">${nota}</p>` : ''}</div>`;
  };
  const perfis = Object.entries(par.perfis).map(([nome, v]) => `${NOME_DIFICULDADE[nome].toLowerCase()} (${pct(v.proporcaoQuebrados)} quebrados, ${pct(v.proporcaoBloqueados)} bloqueados)`).join('; ');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Broken Grid — Dados experimentais</title>
<style>${CSS}${CSS_DADOS}</style></head>
<body>

<header class="capa">
  <p class="instituicao">Universidade do Estado de Santa Catarina — UDESC · Projeto Integrador I</p>
  <h1>Broken Grid: dados experimentais<br>dos algoritmos de solução</h1>
  <p class="subtitulo">Anexo de dados do relatório de desempenho — todas as medições do guloso e do exato</p>
  <p class="meta">Coletado em ${dataRel} · ${an.completas.length} instâncias completas · ${an.C.length} medições de escala</p>
</header>

<h2>Ambiente e parâmetros</h2>
<table class="dados dados--chave">
  <tbody>
    <tr><th>Processador</th><td>${esc(amb.cpu)} (${amb.nucleos} núcleos lógicos)</td></tr>
    <tr><th>Memória</th><td>${nf(amb.memoriaGB, 1)} GB</td></tr>
    <tr><th>Sistema</th><td>${esc(amb.so)}</td></tr>
    <tr><th>Runtime</th><td>Node.js ${esc(amb.node)}; cada instância em um <i>worker thread</i> próprio, em sequência</td></tr>
    <tr><th>Teto por instância</th><td>${teto} s (compilação + podas + guloso + busca)</td></tr>
    <tr><th>Bancada A</th><td>${dados.instancias.A.length} instâncias: as grades de <code>data/grids/</code> (4×4 a 7×7) + a grade limpa de cada tamanho; nível do próprio dataset</td></tr>
    <tr><th>Bancada B</th><td>${dados.instancias.B.length} instâncias: ${par.porPerfilB} por nível e tamanho (8×8 a 14×14) + a grade limpa; semente ${par.seedB}; perfis: ${perfis}</td></tr>
    <tr><th>Bancada C</th><td>${an.C.length} medições: 3 grades de perfil médio por tamanho, guloso com e sem podas; semente ${par.seedC}${par.bancadaC ? `. Interrompida pelo ambiente (falta de memória) ao iniciar ${par.bancadaC.interrompidaEm}×${par.bancadaC.interrompidaEm}; dados até ${par.bancadaC.ultimoTamanhoCompleto}×${par.bancadaC.ultimoTamanhoCompleto} recuperados do log` : ''}</td></tr>
    <tr><th>Validação</th><td>${an.completas.every((r) => r.gulosoValido !== false && r.exatoValido !== false) ? `todas as ${an.completas.length * 2} soluções (gulosas e exatas) das bancadas A e B conferidas de forma independente: válidas` : 'há soluções inválidas'}</td></tr>
    <tr><th>Reprodução</th><td><code>node tools/benchmark-solver.mjs</code> e <code>node tools/relatorio-pdf.mjs --modo dados</code>; dados brutos em <code>docs/dados/benchmark-solver.json</code></td></tr>
  </tbody>
</table>

<h2>Dicionário das colunas</h2>
<table class="dados dados--chave">
  <tbody>
    <tr><th>queb. / bloq.</th><td>palitos quebrados (ausentes desde o início) e bloqueados (não removíveis)</td></tr>
    <tr><th>remov.</th><td>palitos removíveis — as variáveis do problema (<i>m</i> efetivo)</td></tr>
    <tr><th>quadrados vivos</th><td>quadrados com os quatro lados presentes, antes e depois das podas — o universo da cobertura</td></tr>
    <tr><th>palitos restantes</th><td>palitos que ainda cobrem algum quadrado após as podas (candidatos da busca)</td></tr>
    <tr><th>obrig.</th><td>palitos forçados pelas podas (quadrado com um único lado removível)</td></tr>
    <tr><th>guloso / exato</th><td>palitos na solução de cada algoritmo; incluem os obrigatórios</td></tr>
    <tr><th>prov.</th><td>se o exato provou a otimalidade dentro do teto; se não, “exato” é a melhor solução encontrada</td></tr>
    <tr><th>cota inf.</th><td>cota inferior na raiz da busca (obrigatórios + quadrados disjuntos); o ótimo está entre ela e “exato”</td></tr>
    <tr><th>compilar · podas · guloso · busca</th><td>tempo de cada etapa, em milissegundos</td></tr>
    <tr><th>total guloso</th><td>compilar + podas + guloso — tempo até a primeira resposta</td></tr>
    <tr><th>total exato</th><td>total guloso + busca; nas instâncias não provadas, ≈ teto</td></tr>
    <tr><th>nós</th><td>nós explorados pela busca; numa instância não provada, até o teto</td></tr>
    <tr><th>excesso do guloso</th><td>guloso − ótimo, só onde o ótimo foi provado</td></tr>
  </tbody>
</table>

<h2>Tabelas agregadas</h2>
${tabela(tabelaResumoPorNivel(an), 'Resumo por nível de dificuldade (bancadas A e B).',
    'Medianas e máximos do exato consideram só as instâncias provadas. “Maior n com todas provadas”: maior tamanho com todos os tamanhos até ele inteiramente provados.')}
${tabela(tabelaPorTamanho(an, 'A'), `Bancada A — por tamanho e nível (teto de ${teto} s).`)}
${tabela(tabelaPorTamanho(an, 'B'), `Bancada B — por tamanho e nível (teto de ${teto} s).`, 'Nas medianas do exato, instâncias não provadas contam com o valor do teto.')}
${tabela(tabelaTrintaSegundos(an), `Instâncias com ótimo provado em até ${teto} s, por tamanho e nível.`)}
${tabela(tabelaQualidade(an), 'Qualidade do guloso por nível (instâncias com ótimo provado).')}
${tabela(tabelaPodas(an), 'Efeito das podas de redução por nível (médias por instância).')}
${tabela(tabelaTamanhoInstancia(), 'Tamanho da instância por grade (grade limpa): m = 2n(n+1), q = n(n+1)(2n+1)/6.')}

<section class="paisagem">
<h2>Escala do guloso (bancada C)</h2>
${tabela(tabelaEscalaCompleta(an), 'Todas as medições da bancada C: três grades de perfil médio por tamanho, na mesma ordem nas colunas.',
    par.bancadaC ? 'Tempos totais do log da execução, que não registra o tempo por etapa nem a validação da solução.' : '')}

<h2>Resultados por instância (bancadas A e B)</h2>
${tabela(tabelaInstanciasCompleta(an), `Todas as ${an.completas.length} instâncias completas, ordenadas por bancada, tamanho e nível.`,
    'Linhas sombreadas: ótimo não provado dentro do teto.')}
</section>

</body></html>`;
}

const CSS_DADOS = `
@page paisagem { size: A4 landscape; margin: 14mm 12mm 16mm 12mm; }
.paisagem { page: paisagem; }
table.dados--bruta { font-size: 7pt; }
table.dados--bruta th, table.dados--bruta td { padding: .55mm 1.1mm; }
table.dados--bruta thead { display: table-header-group; }
table.dados--bruta tr.nao-provada td { background: #f4f3f0; }
table.dados--chave { width: 100%; font-size: 8.5pt; margin-bottom: 4mm; }
table.dados--chave th { width: 34mm; font-weight: 600; vertical-align: top; }
`;

const CSS = `
@page { size: A4; margin: 20mm 18mm 20mm 18mm;
  @bottom-center { content: counter(page); font: 9pt "Segoe UI", Arial, sans-serif; color: #6b6a66; } }
@page :first { @bottom-center { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 10.5pt/1.5 Cambria, Georgia, "Times New Roman", serif; color: #1b1b1a; background: #ffffff; }
h1, h2, h3, .instituicao, .subtitulo, .meta, figcaption, .tabela__titulo, .nota, table, .legenda, .destaques, pre {
  font-family: "Segoe UI", Arial, sans-serif; }
.capa { padding: 6mm 0 7mm; border-bottom: 2px solid #1b1b1a; margin-bottom: 7mm; }
.instituicao { font-size: 9pt; color: #52514e; margin: 0 0 6mm; letter-spacing: .02em; }
h1 { font-size: 23pt; line-height: 1.15; margin: 0 0 4mm; font-weight: 700; letter-spacing: -.01em; }
.subtitulo { font-size: 11.5pt; color: #3a3936; margin: 0 0 4mm; }
.meta { font-size: 9pt; color: #6b6a66; margin: 0; }
body { counter-reset: secao; }
h2 { font-size: 14pt; margin: 8mm 0 2.5mm; break-after: avoid; counter-increment: secao; counter-reset: subsecao; }
h2::before { content: counter(secao) ". "; }
h2.sem-numero { counter-increment: none; }
h2.sem-numero::before, h2.quebra::before { content: none; }
h2.quebra { break-before: page; counter-increment: none; }
h3 { font-size: 11pt; margin: 5mm 0 1.5mm; break-after: avoid; counter-increment: subsecao; }
h3::before { content: counter(secao) "." counter(subsecao) " "; }
p { margin: 0 0 2.6mm; text-align: justify; hyphens: auto; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; text-align: justify; }
.resumo { background: #f4f3f0; border-left: 3px solid #2a78d6; padding: 3.5mm 5mm 1.5mm; margin-bottom: 4mm; }
.resumo h2 { margin-top: 0; }
code { font: 9pt Consolas, "Courier New", monospace; background: #f0efec; padding: 0 1.2mm; border-radius: 2px; }
pre { font: 9pt Consolas, "Courier New", monospace; background: #f4f3f0; padding: 3mm 4mm; border-radius: 3px; margin: 0 0 3mm; }
.formula { text-align: center; font-style: italic; margin: 1.5mm 0 3mm; }
figure { margin: 4mm 0 5mm; break-inside: avoid; }
figcaption { font-size: 8.5pt; color: #52514e; margin-top: 1.5mm; line-height: 1.4; }
.exemplo { display: flex; align-items: center; gap: 8mm; }
.exemplo .legenda { flex-direction: column; align-items: flex-start; gap: 2mm; }
.legenda { display: flex; flex-wrap: wrap; gap: 1.5mm 5mm; font-size: 8.5pt; color: #3a3936; margin-bottom: 1.5mm; }
.legenda__item { display: inline-flex; align-items: center; gap: 1.5mm; }
.grafico { display: block; }
.grafico .grade { stroke: #e6e5e1; stroke-width: 1; }
.grafico .eixo-linha { stroke: #8f8e89; stroke-width: 1; }
.grafico .eixo { font: 9px "Segoe UI", Arial, sans-serif; fill: #52514e; font-variant-numeric: tabular-nums; }
.grafico .eixo-titulo { font: 600 9.5px "Segoe UI", Arial, sans-serif; fill: #3a3936; }
.grafico .referencia { stroke: #8f8e89; stroke-width: 1; stroke-dasharray: 2 3; }
.grafico .referencia-texto { font: 8.5px "Segoe UI", Arial, sans-serif; fill: #6b6a66; }
.grafico .rotulo-direto { font: 600 9px "Segoe UI", Arial, sans-serif; fill: #1b1b1a; }
.grafico .rotulo-valor { font: 600 9px "Segoe UI", Arial, sans-serif; fill: #1b1b1a; }
.tabela { margin: 3mm 0 5mm; }
.tabela__titulo { font-size: 8.5pt; color: #3a3936; margin-bottom: 1.5mm; text-align: left; }
table.dados { width: 100%; border-collapse: collapse; font-size: 8pt; font-variant-numeric: tabular-nums; }
table.dados th, table.dados td { padding: 1.1mm 1.6mm; border-bottom: 1px solid #e6e5e1; text-align: left; }
table.dados thead th { border-bottom: 1.5px solid #1b1b1a; font-weight: 600; color: #1b1b1a; vertical-align: bottom; line-height: 1.25; }
table.dados thead tr:first-child th.grupo { text-align: center; border-bottom: 1px solid #b9b8b3; }
table.dados .num { text-align: right; }
table.dados tr { break-inside: avoid; }
table.dados tr.linha-limpa td { color: #3a3936; background: #f7f6f3; }
table.dados--compacta { width: auto; min-width: 60%; }
table.dados--apendice { font-size: 7.2pt; }
table.dados--apendice th, table.dados--apendice td { padding: .6mm 1.3mm; }
td.vazio { color: #b9b8b3; }
.nota { font-size: 8pt; color: #6b6a66; margin-top: 1.5mm; }
.aviso { color: #a33; }
.destaques { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 2mm 0 4mm; break-inside: avoid; }
.destaques > div { border-top: 2px solid #2a78d6; padding-top: 2mm; }
.destaque__valor { display: block; font-size: 17pt; font-weight: 700; line-height: 1.1; }
.destaque__rotulo { display: block; font-size: 8pt; color: #52514e; line-height: 1.35; margin-top: 1mm; }
`;

// ---------------------------------------------------------------- impressao

const CANDIDATOS_CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

async function acharChrome() {
  for (const caminho of CANDIDATOS_CHROME) {
    try {
      await access(caminho);
      return caminho;
    } catch { /* tenta o proximo */ }
  }
  throw new Error('Chrome/Edge nao encontrado; defina a variavel CHROME com o caminho do executavel');
}

async function imprimirPdf(html, destino) {
  const chrome = await acharChrome();
  const arquivoHtml = resolve(os.tmpdir(), `broken-grid-relatorio-${process.pid}.html`);
  await writeFile(arquivoHtml, html, 'utf8');
  await promisify(execFile)(chrome, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--no-first-run',
    `--user-data-dir=${resolve(os.tmpdir(), `broken-grid-chrome-${process.pid}`)}`,
    `--print-to-pdf=${destino}`,
    pathToFileURL(arquivoHtml).href,
  ], { timeout: 120000 });
  return arquivoHtml;
}

function lerArgumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : process.argv[i + 1];
}

async function exemploResolvido() {
  const { resolver } = await import('../src/solver/index.js');
  const dataset = JSON.parse(await readFile(resolve(RAIZ, 'data', 'grids', '4x4.json'), 'utf8'));
  const grid = dataset.grids[0];
  const config = { n: 4, quebrados: grid.quebrados, bloqueados: grid.bloqueados };
  const r = await resolver(config, { orcamentoMs: 10000 });
  return { id: grid.id, config, solucao: r.palitos };
}

async function principal() {
  const modo = lerArgumento('modo', 'relatorio');
  if (!['relatorio', 'dados'].includes(modo)) throw new Error(`modo desconhecido: ${modo} (use relatorio ou dados)`);
  const padrao = modo === 'dados' ? 'docs/dados-experimentais.pdf' : 'docs/relatorio-desempenho-algoritmos.pdf';
  const origem = resolve(RAIZ, lerArgumento('dados', 'docs/dados/benchmark-solver.json'));
  const destino = resolve(RAIZ, lerArgumento('saida', padrao));
  const html = lerArgumento('html', null);

  const dados = JSON.parse(await readFile(origem, 'utf8'));
  const an = analisar(dados);
  const documento = modo === 'dados' ? montarHtmlDados(dados, an) : montarHtml(dados, an, await exemploResolvido());

  if (html) await writeFile(resolve(RAIZ, html), documento, 'utf8');
  await mkdir(dirname(destino), { recursive: true });
  await imprimirPdf(documento, destino);
  console.log(`PDF gravado em ${destino}`);
}

await principal();
