// Uso: node tools/especificacao-hardware-pdf.mjs [--saida caminho.pdf] [--html caminho.html]
//
// Gera docs/hardware/especificacao-hardware.pdf: especificação do hardware, diagramas e
// esquemas, integração com o software (ponte Web Serial com o firmware
// hardware/broken_grid_periferico) e o protótipo digital do tabuleiro físico 4x4
// (circuito "Broken Grid 4x4 - Tabuleiro (Tinkercad)").
// A especificação fechada é docs/Instrulçoes.txt; os diagramas da grade saem da mesma
// numeração de LEDs dos firmwares (h:r:c -> 9r + c, v:r:c -> 9r + 4 + (4 - c)), então
// documento e código não divergem.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { listarPalitos, analisarId, HORIZONTAL } from '../src/core/geometry.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const N = 4;
const URL_TINKERCAD = 'https://www.tinkercad.com/things/33evPOPHUoC';

// saída do firmware para g4-001 (comando SOLUCAO), na ordem da corrente de LEDs
const SOLUCAO_G4_001 = ['h:0:2', 'h:2:0', 'v:2:2', 'h:3:2', 'h:3:3', 'v:3:1'];

const COR_LED = {
  removivel: '#f4f4f1', bloqueado: '#e5484d', apagado: '#3a3e42',
  cursor: '#f4f4f1', solucao: '#22b8cf', vitoria: '#30c272',
};

// ---------------------------------------------------------------- geometria

// corrente em zigue-zague: h:r:c -> r*9 + c, v:r:c -> r*9 + 4 + (4 - c)
function indiceDoLed(id) {
  const { orientacao, linha, coluna } = analisarId(id);
  return orientacao === HORIZONTAL ? linha * (2 * N + 1) + coluna : linha * (2 * N + 1) + N + (N - coluna);
}

function segmento(id, passo, x0, y0, folga) {
  const { orientacao, linha, coluna } = analisarId(id);
  const x = x0 + coluna * passo;
  const y = y0 + linha * passo;
  return orientacao === HORIZONTAL
    ? { x1: x + folga, y1: y, x2: x + passo - folga, y2: y, h: true }
    : { x1: x, y1: y + folga, x2: x, y2: y + passo - folga, h: false };
}

const centro = (s) => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });

// ---------------------------------------------------------------- figuras

function svgGradeLed(corDe, { passo = 46, titulo = '', piscando = null } = {}) {
  const m = 22;
  const lado = N * passo + 2 * m;
  const partes = [`<rect x="0" y="0" width="${lado}" height="${lado}" rx="10" fill="#17191b"/>`];
  for (let l = 0; l <= N; l += 1) {
    for (let c = 0; c <= N; c += 1) {
      partes.push(`<rect x="${m + c * passo - 3}" y="${m + l * passo - 3}" width="6" height="6" rx="1" fill="#2a2d30"/>`);
    }
  }
  for (const id of listarPalitos(N)) {
    const s = segmento(id, passo, m, m, 7);
    const cor = corDe(id);
    // halo translúcido em vez de filtro: filtro SVG em linha reta tem área zero e some
    if (cor !== COR_LED.apagado) {
      partes.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${cor}" stroke-width="15" stroke-linecap="round" opacity=".22"/>`);
    }
    partes.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${cor}" stroke-width="7" stroke-linecap="round"/>`);
    // cursor: contorno tracejado indica o palito que está piscando
    if (id === piscando) {
      const pad = 7;
      const x = Math.min(s.x1, s.x2) - pad;
      const y = Math.min(s.y1, s.y2) - pad;
      partes.push(`<rect x="${x}" y="${y}" width="${Math.abs(s.x2 - s.x1) + 2 * pad}" height="${Math.abs(s.y2 - s.y1) + 2 * pad}" rx="6" fill="none" stroke="#f5c542" stroke-width="1.6" stroke-dasharray="3 2"/>`);
    }
  }
  return `<svg viewBox="0 0 ${lado} ${lado + (titulo ? 20 : 0)}" width="${lado}" role="img" aria-label="${titulo}">
  ${partes.join('\n  ')}
  ${titulo ? `<text x="${lado / 2}" y="${lado + 15}" text-anchor="middle" class="rotulo">${titulo}</text>` : ''}
</svg>`;
}

function svgMapaLeds() {
  const passo = 92;
  const m = 70;
  const lado = N * passo + 2 * m;
  const partes = [];
  const ordem = [...listarPalitos(N)].sort((a, b) => indiceDoLed(a) - indiceDoLed(b));
  // caminho da corrente de dados, LED 0 -> LED 39
  const pontos = ordem.map((id) => centro(segmento(id, passo, m, m, 10)));
  partes.push(`<polyline points="${pontos.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#8a8984" stroke-width="1.4" stroke-dasharray="4 3" marker-mid="url(#seta)"/>`);
  for (let l = 0; l <= N; l += 1) {
    for (let c = 0; c <= N; c += 1) {
      partes.push(`<circle cx="${m + c * passo}" cy="${m + l * passo}" r="3.5" fill="#1b1b1a"/>`);
    }
  }
  for (const id of ordem) {
    const s = segmento(id, passo, m, m, 10);
    const i = indiceDoLed(id);
    const cor = s.h ? '#2a78d6' : '#eb6834';
    const { x: mx, y: my } = centro(s);
    partes.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${cor}" stroke-width="9" stroke-linecap="round" opacity=".35"/>`);
    partes.push(`<circle cx="${mx}" cy="${my}" r="10" fill="${cor}" stroke="#fff" stroke-width="1.5"/>`);
    partes.push(`<text x="${mx}" y="${my + 3.5}" text-anchor="middle" class="indice">${i}</text>`);
    partes.push(s.h
      ? `<text x="${mx}" y="${my - 14}" text-anchor="middle" class="id">${id}</text>`
      : `<text x="${mx - 14}" y="${my + 3}" text-anchor="end" class="id">${id}</text>`);
  }
  // sentido de cada fileira da corrente
  for (let r = 0; r <= 2 * N; r += 1) {
    const y = m + (r * passo) / 2;
    const horizontal = r % 2 === 0;
    partes.push(`<text x="${lado - m + 22}" y="${y + 4}" class="faixa">${horizontal ? '→' : '←'}</text>`);
  }
  partes.push(`<text x="${m - 30}" y="${m - 40}" class="faixa">D6 → 330 Ω → DIN do LED 0</text>`);
  return `<svg viewBox="0 0 ${lado} ${lado}" width="${lado * 0.82}" role="img" aria-label="Mapa de palitos para LEDs">
  <defs><marker id="seta" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
  <path d="M0 0L10 5L0 10z" fill="#8a8984"/></marker></defs>
  <style>.indice{font:700 10px "Segoe UI",Arial,sans-serif;fill:#fff}.id{font:8.5px Consolas,monospace;fill:#52514e}
  .faixa{font:600 11px "Segoe UI",Arial,sans-serif;fill:#1b1b1a}</style>
  ${partes.join('\n  ')}
</svg>`;
}

// percurso de exemplo na grade g4-001: mostra o cursor pulando palitos não removíveis
function svgNavegacao(quebrados, bloqueados) {
  const passo = 70;
  const m = 26;
  const x0 = 30;
  const largura = x0 + N * passo + 400;
  const altura = N * passo + 2 * m;
  const partes = [];
  for (const id of listarPalitos(N)) {
    const s = segmento(id, passo, x0, m, 9);
    if (quebrados.has(id)) {
      partes.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="#b9b8b3" stroke-width="2" stroke-dasharray="3 3"/>`);
    } else {
      partes.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${bloqueados.has(id) ? '#e5484d' : '#b9b8b3'}" stroke-width="6" stroke-linecap="round"/>`);
    }
  }
  const destaque = ['h:0:0', 'h:0:1', 'h:1:0', 'v:0:0', 'v:0:2'];
  destaque.forEach((id, k) => {
    const s = segmento(id, passo, x0, m, 9);
    partes.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="#f5a524" stroke-width="7" stroke-linecap="round"/>`);
    const { x: mx, y: my } = centro(s);
    const cx = mx + (s.h ? 0 : 13);
    const cy = my + (s.h ? -13 : 0);
    partes.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="#1b1b1a"/>`);
    partes.push(`<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" class="passo">${k + 1}</text>`);
  });
  const xl = x0 + N * passo + 40;
  const leg = [
    ['1', 'início: primeiro palito removível (LED de menor índice)', 'h:0:0'],
    ['2', 'controle H → direita: próximo removível da linha', 'h:0:1'],
    ['3', 'controle H ↓ baixo: próxima linha com removível, perto da coluna', 'h:1:0'],
    ['', '(h:1:1 e h:1:2 bloqueados, h:1:3 quebrado: pulados)', ''],
    ['4', 'controle V, qualquer direção: troca para o vertical mais próximo', 'v:0:0'],
    ['5', 'controle V → direita: pula v:0:1 (quebrado)', 'v:0:2'],
  ];
  leg.forEach(([n, texto, id], k) => {
    const y = m + 6 + k * 22;
    partes.push(`<text x="${xl}" y="${y}" class="leg">${n ? `<tspan font-weight="700">${n}.</tspan> ` : '   '}${texto}${id ? ` <tspan class="cod">${id}</tspan>` : ''}</text>`);
  });
  const yl = m + 6 + leg.length * 22 + 14;
  partes.push(`<line x1="${xl}" y1="${yl - 4}" x2="${xl + 18}" y2="${yl - 4}" stroke="#e5484d" stroke-width="5" stroke-linecap="round"/><text x="${xl + 26}" y="${yl}" class="leg">bloqueado</text>`);
  partes.push(`<line x1="${xl + 100}" y1="${yl - 4}" x2="${xl + 118}" y2="${yl - 4}" stroke="#b9b8b3" stroke-width="2" stroke-dasharray="3 3"/><text x="${xl + 126}" y="${yl}" class="leg">quebrado</text>`);
  return `<svg viewBox="0 0 ${largura} ${altura}" width="${largura * 0.92}" role="img" aria-label="Navegação do cursor">
  <style>.leg{font:10px "Segoe UI",Arial,sans-serif;fill:#1b1b1a}.cod{font:9.5px Consolas,monospace;fill:#52514e}
  .passo{font:700 9.5px "Segoe UI",Arial,sans-serif;fill:#fff}</style>
  ${partes.join('\n  ')}
</svg>`;
}

function svgBlocos() {
  const caixa = (x, y, w, h, titulo, sub = '', cor = '#ffffff') => {
    const linhas = [].concat(sub || []);
    const topo = y + h / 2 - (linhas.length * 13) / 2 + 2;
    return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${cor}" stroke="#1b1b1a" stroke-width="1.3"/>
  <text x="${x + w / 2}" y="${topo}" text-anchor="middle" class="t">${titulo}</text>
  ${linhas.map((l, k) => `<text x="${x + w / 2}" y="${topo + 15 + k * 13}" text-anchor="middle" class="s">${l}</text>`).join('')}`;
  };
  const seta = (x1, y1, x2, y2, rot = '', dx = 0, dy = -6) => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1b1b1a" stroke-width="1.6" marker-end="url(#ponta)"/>
  ${rot ? `<text x="${(x1 + x2) / 2 + dx}" y="${(y1 + y2) / 2 + dy}" text-anchor="middle" class="r">${rot}</text>` : ''}`;
  return `<svg viewBox="0 0 700 330" width="660" role="img" aria-label="Diagrama de blocos">
  <style>.t{font:600 11.5px "Segoe UI",Arial,sans-serif;fill:#1b1b1a}.s{font:9.5px "Segoe UI",Arial,sans-serif;fill:#52514e}
  .r{font:9.5px "Segoe UI",Arial,sans-serif;fill:#3a3936}</style>
  <defs><marker id="ponta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
  <path d="M0 0L10 5L0 10z" fill="#1b1b1a"/></marker>
  <marker id="pontaV" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
  <path d="M0 0L10 5L0 10z" fill="#c2410c"/></marker></defs>
  ${caixa(20, 20, 150, 76, 'Computador (cérebro)', ['regras · solver · cursor', 'cronômetro · estatísticas', 'Chrome/Edge + Web Serial'], '#eef4fc')}
  ${caixa(270, 120, 160, 80, 'Arduino Uno', ['ATmega328P · periférico', 'eventos ↑  cores dos LEDs ↓'], '#eef4fc')}
  ${caixa(520, 120, 160, 80, 'Grade de LEDs', ['40 × WS2812B', 'corrente única em zigue-zague'], '#fdf3ec')}
  ${caixa(20, 120, 150, 50, '4 potenciômetros', 'H: A0/A1 · V: A2/A3')}
  ${caixa(20, 190, 150, 64, '3 botões 24 mm', ['REMOVER D2 · VOLTAR D3', 'SOLUÇÃO D4 (INPUT_PULLUP)'])}
  ${caixa(520, 20, 160, 58, 'Fonte 5 V / 2–3 A', ['P4 + chave liga/desliga', '1000 µF na entrada'])}
  <line x1="172" y1="66" x2="300" y2="118" stroke="#1b1b1a" stroke-width="1.6" marker-end="url(#ponta)" marker-start="url(#ponta)"/>
  <text x="252" y="76" class="r">USB · Web Serial 115200 baud</text>
  <text x="252" y="89" class="r">(também alimenta o Uno)</text>
  ${seta(170, 145, 268, 155, '', 0, 0)}
  ${seta(170, 222, 268, 185, '', 0, 0)}
  ${seta(430, 160, 518, 160, 'D6 → 330 Ω → DIN', 0, -6)}
  <line x1="600" y1="78" x2="600" y2="118" stroke="#c2410c" stroke-width="2" marker-end="url(#pontaV)"/>
  <text x="608" y="102" class="r">+5 V / GND</text>
  <line x1="350" y1="200" x2="350" y2="290" stroke="#52514e" stroke-width="1.6" stroke-dasharray="5 3"/>
  <line x1="350" y1="290" x2="640" y2="290" stroke="#52514e" stroke-width="1.6" stroke-dasharray="5 3"/>
  <line x1="640" y1="290" x2="640" y2="200" stroke="#52514e" stroke-width="1.6" stroke-dasharray="5 3"/>
  <text x="495" y="306" text-anchor="middle" class="r">GND comum entre fonte e Arduino (obrigatório) · o +5 V da fonte nunca vai no 5V do Uno</text>
  <text x="220" y="282" text-anchor="middle" class="r">5V do Uno alimenta só os potenciômetros</text>
</svg>`;
}

function svgEsquema() {
  const partes = [];
  partes.push('<rect x="40" y="30" width="140" height="400" rx="6" fill="#eef4fc" stroke="#1b1b1a" stroke-width="1.3"/>');
  partes.push('<text x="105" y="225" text-anchor="middle" class="t">Arduino</text><text x="105" y="241" text-anchor="middle" class="t">Uno</text>');
  const pino = (nome, y) => {
    partes.push(`<text x="172" y="${y + 4}" text-anchor="end" class="p">${nome}</text>`);
  };
  // controles: perna do meio de cada potenciômetro na analógica, pontas no +5V e GND do Uno
  [['H', 'A0', 'A1', 60], ['V', 'A2', 'A3', 150]].forEach(([nome, ax, ay, y]) => {
    pino(ax, y);
    pino(ay, y + 22);
    partes.push(`<line x1="180" y1="${y}" x2="300" y2="${y}" class="fio"/><line x1="180" y1="${y + 22}" x2="300" y2="${y + 22}" class="fio"/>`);
    partes.push(`<rect x="300" y="${y - 18}" width="110" height="66" rx="5" fill="#fff" stroke="#1b1b1a" stroke-width="1.2"/>`);
    partes.push(`<text x="355" y="${y - 24}" text-anchor="middle" class="n">Controle ${nome} (2 potenciômetros)</text>`);
    partes.push(`<text x="306" y="${y + 4}" class="c">X</text><text x="306" y="${y + 26}" class="c">Y</text>`);
    partes.push(`<text x="404" y="${y + 4}" text-anchor="end" class="v">+5V</text><text x="404" y="${y + 26}" text-anchor="end" class="g">GND</text>`);
  });
  // botões: pino -> botão -> GND, pull-up interno
  [['D2', 'REMOVER'], ['D3', 'VOLTAR'], ['D4', 'SOLUÇÃO']].forEach(([p, nome], k) => {
    const y = 250 + k * 40;
    pino(p, y);
    partes.push(`<line x1="180" y1="${y}" x2="300" y2="${y}" class="fio"/>`);
    partes.push(`<circle cx="300" cy="${y}" r="2.6" fill="#fff" stroke="#1b1b1a"/><circle cx="340" cy="${y}" r="2.6" fill="#fff" stroke="#1b1b1a"/>`);
    partes.push(`<line x1="300" y1="${y - 4}" x2="338" y2="${y - 13}" class="fio"/>`);
    partes.push(`<text x="320" y="${y - 17}" text-anchor="middle" class="n">${nome}</text>`);
    partes.push(`<line x1="343" y1="${y}" x2="392" y2="${y}" class="fio"/><text x="397" y="${y + 4}" class="g">GND</text>`);
  });
  partes.push('<text x="190" y="356" class="c">INPUT_PULLUP: apertado = LOW, sem resistor externo</text>');
  // dados dos LEDs
  const yD6 = 400;
  pino('D6', yD6);
  partes.push(`<line x1="180" y1="${yD6}" x2="240" y2="${yD6}" class="fio"/>`);
  partes.push(`<rect x="240" y="${yD6 - 5}" width="44" height="10" fill="#fff" stroke="#1b1b1a" stroke-width="1.2"/>`);
  partes.push(`<text x="262" y="${yD6 + 20}" text-anchor="middle" class="c">330 Ω</text>`);
  partes.push(`<line x1="284" y1="${yD6}" x2="480" y2="${yD6}" class="fio"/>`);
  partes.push(`<text x="486" y="${yD6 + 4}" class="c">DIN</text>`);
  partes.push('<rect x="480" y="355" width="210" height="90" rx="6" fill="#fdf3ec" stroke="#1b1b1a" stroke-width="1.3"/>');
  partes.push('<text x="595" y="383" text-anchor="middle" class="t">40 × WS2812B</text>');
  partes.push('<text x="595" y="400" text-anchor="middle" class="c">LED 0 → LED 1 → … → LED 39</text>');
  partes.push('<text x="595" y="415" text-anchor="middle" class="c">(DO de um → DIN do próximo;</text>');
  partes.push('<text x="595" y="429" text-anchor="middle" class="c">+5V e GND em paralelo)</text>');
  partes.push('<line x1="530" y1="355" x2="530" y2="250" class="fio"/><text x="530" y="243" text-anchor="middle" class="v">+5V_LED</text>');
  partes.push('<line x1="650" y1="355" x2="650" y2="250" class="fio"/><text x="650" y="243" text-anchor="middle" class="g">GND</text>');
  // capacitor na entrada, faixa do lado do GND
  partes.push('<line x1="530" y1="300" x2="584" y2="300" class="fio"/><line x1="584" y1="288" x2="584" y2="312" stroke="#1b1b1a" stroke-width="2"/>');
  partes.push('<path d="M594 288 Q589 300 594 312" fill="none" stroke="#1b1b1a" stroke-width="2"/><line x1="592" y1="300" x2="650" y2="300" class="fio"/>');
  partes.push('<text x="577" y="296" text-anchor="end" class="c">+</text>');
  partes.push('<text x="590" y="332" text-anchor="middle" class="c">1000 µF ≥ 10 V</text>');
  // fonte
  partes.push('<rect x="480" y="110" width="210" height="64" rx="6" fill="#fff" stroke="#1b1b1a" stroke-width="1.3"/>');
  partes.push('<text x="585" y="136" text-anchor="middle" class="t">Fonte 5 V / 2–3 A</text>');
  partes.push('<text x="585" y="153" text-anchor="middle" class="c">jack P4 → chave liga/desliga</text>');
  partes.push('<line x1="530" y1="174" x2="530" y2="230" class="fio"/><line x1="650" y1="174" x2="650" y2="230" class="fio"/>');
  // alimentação do Uno: USB; GND comum com a fonte
  partes.push('<text x="80" y="420" text-anchor="middle" class="p">USB</text><text x="140" y="420" text-anchor="middle" class="p">GND</text>');
  partes.push('<line x1="140" y1="430" x2="140" y2="465" class="fio"/><text x="140" y="478" text-anchor="middle" class="g">GND</text>');
  partes.push('<text x="80" y="450" text-anchor="middle" class="c">do PC</text>');
  partes.push('<text x="700" y="478" text-anchor="end" class="c">rótulos iguais indicam o mesmo nó · +5V = 5V do Uno · +5V_LED = fonte (não interligar)</text>');
  return `<svg viewBox="0 0 710 490" width="640" role="img" aria-label="Esquema elétrico">
  <style>.fio{stroke:#1b1b1a;stroke-width:1.4;fill:none}.t{font:600 11.5px "Segoe UI",Arial,sans-serif;fill:#1b1b1a}
  .p{font:600 10px Consolas,monospace;fill:#1b1b1a}.n{font:600 9.5px "Segoe UI",Arial,sans-serif;fill:#1b1b1a}
  .c{font:9.5px "Segoe UI",Arial,sans-serif;fill:#3a3936}.v{font:700 9.5px "Segoe UI",Arial,sans-serif;fill:#c2410c}
  .g{font:700 9.5px "Segoe UI",Arial,sans-serif;fill:#52514e}</style>
  ${partes.join('\n  ')}
</svg>`;
}

// ---------------------------------------------------------------- documento

async function montarHtml() {
  const dataset = JSON.parse(await readFile(resolve(RAIZ, 'data/grids/4x4.json'), 'utf8'));
  const g1 = dataset.grids[0];
  const quebrados = new Set(g1.quebrados);
  const bloqueados = new Set(g1.bloqueados);
  const solucao = new Set(SOLUCAO_G4_001);
  const original = (id) => (quebrados.has(id) ? COR_LED.apagado : bloqueados.has(id) ? COR_LED.bloqueado : COR_LED.removivel);
  const removidosExemplo = new Set(['h:0:2', 'h:2:0']);
  const telaJogo = svgGradeLed((id) => (removidosExemplo.has(id) ? COR_LED.apagado : original(id)), { titulo: 'Jogando', piscando: 'h:3:2' });
  const telaSolucao = svgGradeLed((id) => (solucao.has(id) ? COR_LED.solucao : original(id)), { titulo: 'Modo solução' });
  const telaVitoria = svgGradeLed((id) => (quebrados.has(id) || solucao.has(id) ? COR_LED.apagado : COR_LED.vitoria), { titulo: 'Vitória' });

  let fig = 0;
  let tab = 0;
  const figura = (conteudo, legenda) => {
    fig += 1;
    return `<figure>${conteudo}<figcaption><b>Figura ${fig}</b> — ${legenda}</figcaption></figure>`;
  };
  const tabela = (cabecalho, linhas, legenda, nota = '') => {
    tab += 1;
    return `<div class="tabela"><p class="tabela__titulo"><b>Tabela ${tab}</b> — ${legenda}</p>
<table class="dados"><thead><tr>${cabecalho.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
<tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}</tbody></table>
${nota ? `<p class="nota">${nota}</p>` : ''}</div>`;
  };

  const foto = pathToFileURL(resolve(RAIZ, 'docs/prototipos/Prototipo Fisico.jpeg')).href;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Broken Grid — Especificação do Hardware</title>
<style>${CSS}</style></head>
<body>

<header class="capa">
  <p class="instituicao">Universidade do Estado de Santa Catarina — UDESC · Projeto Integrador I</p>
  <h1>Broken Grid: tabuleiro físico 4×4</h1>
  <p class="subtitulo">Especificação do hardware, diagramas e esquemas eletrônicos, integração com o software
  e protótipo digital (Tinkercad Circuits)</p>
  <p class="meta">Guilherme Gomes Wolff · Luan Caetano Camargo · Lucas Felicio Jacinto · Lucas Leonardo Ratzmann ·
  Thiago Rafael Schulze</p>
</header>

<section class="resumo">
  <h2 class="sem-numero">Resumo</h2>
  <p>O tabuleiro físico leva o <i>Broken Grid</i> para fora do navegador: uma grade 4×4 em que cada um dos
  <b>40 palitos</b> é um LED endereçável WS2812B, ligados numa corrente única em zigue-zague. O jogador usa
  <b>dois controles</b> de cursor, cada um com dois potenciômetros — <b>H</b> percorre os palitos horizontais e
  <b>V</b> os verticais — e <b>três botões</b>: <b>REMOVER</b>, <b>VOLTAR</b> (desfaz a última jogada) e
  <b>SOLUÇÃO</b> (mostra a solução ótima sobre a grade inicial). No tabuleiro final o <b>computador é o
  cérebro</b>: regras, solver, cursor, cronômetro e estatísticas rodam no jogo em JavaScript, e um <b>Arduino
  Uno</b> é só periférico via USB (Web Serial), enviando os eventos dos controles e recebendo a cor de cada LED.
  Essa ponte está implementada e foi testada com o Uno real. Antes da montagem, o circuito completo também foi
  construído e validado no <b>Tinkercad Circuits</b> com um sketch que roda a partida inteira no próprio
  Arduino.</p>
</section>

<h2>Escopo do protótipo físico</h2>
<p>O protótipo cobre o tamanho <b>4×4</b>, o menor dos quatro suportados pelo jogo: 40 palitos e 30 quadrados
possíveis. A divisão de responsabilidades segue a especificação fechada da equipe
(<code>docs/Instrulçoes.txt</code>):</p>
<ul>
  <li><b>No computador:</b> nova partida, regras, solver, cursor, cronômetro, estatísticas e desempenho — tudo o que
  já existe no jogo do navegador.</li>
  <li><b>No tabuleiro:</b> só as interações da jogada (mover o cursor, remover, voltar, ver a solução) e a exibição
  da grade nos LEDs.</li>
  <li><b>Fora do escopo:</b> tamanhos 5×5 a 7×7 no hardware e alimentação por bateria.</li>
</ul>
<p>A especificação inicial previa um Arduino Nano e dois joysticks KY-023. A montagem usa um <b>Arduino Uno</b>
(mesmo ATmega328P e mesmos pinos) e <b>quatro potenciômetros</b>, dois por controle, ligados nos mesmos pinos dos
eixos dos joysticks. Para a demonstração existe ainda um <b>protótipo digital</b> no Tinkercad (seção 7), que roda
o jogo inteiro só no Arduino, com as 20 grades 4×4 do dataset gravadas no firmware. Ele valida fiação, ordem dos
LEDs e regras do cursor sem depender da ponte Web Serial.</p>

<h2>Especificação do hardware</h2>
<h3>Lista de componentes</h3>
${tabela(['Qtd.', 'Componente', 'Especificação', 'Função', 'No Tinkercad'], [
    ['1', 'Arduino Uno', 'ATmega328P, 16 MHz, 32 KB flash, 2 KB SRAM, 5 V; USB-serial CH340 no clone usado', 'periférico USB: lê controles, escreve LEDs', 'Arduino Uno R3'],
    ['40', 'LED WS2812B em plaquinha redonda ~10 mm', 'RGB, 5 V, 6 pontos de solda (+5V ×2, DIN, DO, GND ×2); 5 pacotes de 10', 'um LED por palito', '40 × NeoPixel'],
    ['4', 'Potenciômetro', 'linear, 3 terminais, 5 V; dois por controle (eixos X e Y)', 'mover o cursor: H horizontais, V verticais', '4 × Potenciômetro'],
    ['3', 'Botão de fliperama 24 mm', 'normalmente aberto; verde, amarelo e azul', 'REMOVER, VOLTAR, SOLUÇÃO', '3 × Botão'],
    ['1', 'Resistor 330 Ω', '¼ W', 'protege a linha de dados dos LEDs', 'Resistor (330 Ω)'],
    ['1', 'Capacitor eletrolítico 1000 µF', '≥ 10 V, faixa do lado do GND', 'segura picos de corrente da grade', '— (pesa na simulação)'],
    ['1', 'Fonte 5 V', '2 a 3 A, conector P4 fêmea', 'alimenta só os LEDs', '— (LEDs no 5V do Uno)'],
    ['1', 'Chave liga/desliga', '—', 'corta a alimentação dos LEDs', '—'],
    ['—', 'Fios', 'silicone 26 AWG em 3 cores (~3 m cada) entre LEDs; 22 AWG da fonte ao LED 0; Dupont fêmea-fêmea nos controles', 'ligações', 'fios do editor'],
    ['—', 'Consumíveis', 'estanho 0,8 mm com fluxo, fluxo extra, termo retrátil 2 e 3 mm, faston 4,8 mm', 'solda e isolação', '—'],
    ['1', 'Estrutura impressa em 3D', 'tampa 180 × 180 mm com 40 rasgos, base/caixa, painel frontal, tampa inferior', 'posiciona LEDs e controles', '—'],
  ], 'componentes do tabuleiro físico e o equivalente usado na simulação')}

<h3>Pinagem</h3>
${tabela(['Pino', 'Direção', 'Ligado a', 'Observação'], [
    ['A0 / A1', 'entrada analógica', 'controle H: potenciômetros X / Y', 'modo posição: faixas de coluna e linha, histerese 25'],
    ['A2 / A3', 'entrada analógica', 'controle V: potenciômetros X / Y', 'idem'],
    ['D2', 'entrada', 'botão REMOVER (verde)', 'INPUT_PULLUP, outro terminal no GND; apertado = LOW'],
    ['D3', 'entrada', 'botão VOLTAR (amarelo)', 'INPUT_PULLUP'],
    ['D4', 'entrada', 'botão SOLUÇÃO (azul)', 'INPUT_PULLUP'],
    ['D6', 'saída', 'DIN do LED 0, via 330 Ω', 'dado WS2812B, 800 kHz'],
    ['D0 / D1', 'serial', 'USB (Web Serial no tabuleiro final; Monitor Serial no Tinkercad)', '115200 baud no firmware periférico; 9600 no sketch do Tinkercad'],
    ['D13', 'saída', 'LED “L” da placa', 'pisca a cada quadro de LEDs recebido do computador'],
    ['5V / GND', 'energia', 'potenciômetros; GND comum com a fonte dos LEDs', 'o 5V do Uno não alimenta LEDs'],
  ], 'pinos usados no Arduino')}
<p>Cada potenciômetro tem as pontas no 5V e no GND e a perna do meio no pino analógico. Os botões dispensam
resistor externo: com <code>INPUT_PULLUP</code> o pino fica em HIGH pelo resistor interno e o botão o leva ao
GND.</p>

<h3>Alimentação</h3>
<ul>
  <li>O Arduino é alimentado pelo USB do computador; o 5V dele alimenta só os potenciômetros.</li>
  <li>Os LEDs têm fonte separada de 5 V e 2 a 3 A, com chave liga/desliga e capacitor de 1000 µF (10 V ou mais) na
  entrada, com a faixa do lado do GND.</li>
  <li><b>GND comum</b> entre a fonte e o Arduino é obrigatório. <b>Nunca</b> ligar o +5V da fonte no 5V do Arduino.</li>
  <li>Tudo funciona a 5 V fixos; o brilho é limitado por software. O firmware usa a biblioteca
  <code>Adafruit_NeoPixel</code> com <code>setBrightness(80)</code>, o mesmo brilho que a especificação previa com
  FastLED. Com brilho 80 o pior caso já fica abaixo de 1 A, então o teto de corrente do FastLED
  (<code>setMaxPowerInVoltsAndMilliamps</code>) não faz falta.</li>
</ul>
${tabela(['Situação', 'Corrente estimada'], [
    ['máximo teórico (40 LEDs em branco pleno, 60 mA cada)', '2,4 A'],
    ['todos em branco com brilho 80/255 (pior caso do firmware)', '40 × ≈ 19 mA ≈ 0,75 A'],
    ['tela de vitória (verde, brilho 80)', '40 × ≈ 6 mA ≈ 0,25 A'],
  ], 'consumo estimado (20 mA × valor/255 por canal)',
  'Na prática o consumo fica abaixo de 1 A; a fonte de 3 A deixa margem. A porta USB (500 mA) não deve alimentar a grade.')}

<h2>Diagramas e esquemas</h2>
${figura(svgBlocos(), 'diagrama de blocos do tabuleiro final. O computador roda o jogo e conversa com o Uno pela USB; o Uno lê potenciômetros e botões e escreve os LEDs pela linha D6. A grade tem fonte própria, com GND comum.')}
${figura(svgEsquema(), 'esquema elétrico. Potenciômetros nas entradas analógicas, botões entre o pino e o GND (pull-up interno), linha de dados por 330 Ω até o LED 0 e capacitor de 1000 µF na entrada da fonte dos LEDs.')}

<h3>Mapa de palitos e LEDs</h3>
<p>Não existe endereço gravado nos WS2812B: o “endereço” é a posição na corrente (LED 0 a 39). Os dados vão em
série (DO de um no DIN do próximo, seguindo a seta impressa na plaquinha) e a alimentação vai em paralelo — são
três fios entre cada LED. A corrente segue em <b>zigue-zague</b>: a linha de horizontais da esquerda para a
direita, depois a linha de verticais logo abaixo da direita para a esquerda, e assim por diante. Com os palitos
identificados como no jogo (<code>h:linha:coluna</code> e <code>v:linha:coluna</code>):</p>
<p class="formula">h:r:c → 9·r + c      v:r:c → 9·r + 4 + (4 − c)</p>
${figura(svgMapaLeds(), 'índice de cada LED na corrente (número branco) e identificador do palito (cinza), idêntico ao de <code>src/core/geometry.js</code>. A linha tracejada é o caminho dos dados, do LED 0 ao LED 39.')}

<h3>Cursor</h3>
<p>Só um cursor fica ativo por vez. O controle H move entre palitos horizontais e o V entre verticais; mexer no
controle da outra orientação troca o cursor para o removível mais próximo dela. No tabuleiro final as regras
ficam em <code>src/core/cursor.js</code>, o mesmo código que o teclado usa no navegador. Regras:</p>
<ul>
  <li>O cursor só para em palito <b>removível</b>; pula bloqueados, quebrados e removidos.</li>
  <li><b>Ao longo da linha</b> (esquerda/direita): vai para o próximo removível; se não houver, fica parado.</li>
  <li><b>Para outra linha</b> (cima/baixo): escolhe a próxima linha que tenha algum removível, no palito mais
  próximo da coluna atual.</li>
  <li><b>Depois de remover</b>, vai para o removível mais próximo; <b>ao desfazer</b>, volta para o palito
  restaurado.</li>
  <li><b>Nova partida:</b> começa no primeiro removível da corrente. Empates de distância ficam com o LED de menor
  índice.</li>
  <li><b>Modo posição</b> (potenciômetros, padrão do firmware periférico): cada controle aponta para uma linha e
  uma coluna; o cursor vai para esse palito se ele for removível, senão para o removível mais próximo da mesma
  orientação.</li>
  <li><b>Modo joystick</b> (sketch do Tinkercad, ou <code>MODO_POSICAO = false</code>): girar para um lado anda um
  palito; segurar repete o movimento, primeiro após 500 ms, depois a cada 250 ms.</li>
</ul>
${figura(svgNavegacao(quebrados, bloqueados), 'percurso de exemplo na grade g4-001, a partir do início da partida.')}

<h3>Cores e estados</h3>
${tabela(['Elemento', 'Placa real', 'Simulador (Tinkercad)'], [
    ['palito removível', 'branco', 'branco'],
    ['palito bloqueado', 'vermelho', 'vermelho'],
    ['palito quebrado', 'apagado', 'apagado'],
    ['palito removido', 'apagado', 'azul'],
    ['cursor', 'branco piscando (300 ms)', 'amarelo piscando'],
    ['solução de referência', 'ciano, sobre a grade inicial', 'ciano'],
    ['vitória', 'verde (palitos ainda presentes)', 'verde'],
  ], 'linguagem visual do tabuleiro',
  'No Tinkercad um NeoPixel branco aceso quase não se distingue de um apagado; por isso o sketch tem a chave <code>CORES_DO_SIMULADOR</code> (true no Tinkercad, false na placa real).')}
${figura(`<div class="telas">${telaJogo}${telaSolucao}${telaVitoria}</div>`, 'a grade g4-001 nos três modos, com as cores da placa real: em jogo (dois palitos removidos; o contorno marca o cursor piscando), modo solução (os 6 palitos da solução mínima em ciano) e vitória.')}

<h2>Firmware do tabuleiro final</h2>
<p>O firmware está em <code>hardware/broken_grid_periferico/broken_grid_periferico.ino</code>. O Uno não conhece
as regras do jogo: ele só lê os potenciômetros e os botões, avisa o computador e acende os LEDs na cor que o
computador mandar. O pisca do cursor é feito no próprio Uno, para não depender da USB. Antes do primeiro quadro, o
tabuleiro fica apagado.</p>
<h3>Protocolo serial</h3>
<p>Texto a <b>115200 baud</b>, uma mensagem por linha. Ao abrir a porta o Uno reinicia e anuncia que está pronto;
se o anúncio não chegar em 2,5 s, o computador pergunta <code>?</code> até três vezes antes de desistir.</p>
${tabela(['Mensagem (Uno → computador)', 'Quando'], [
    ['<code>PRONTO broken-grid-periferico v1 n=4 modo=posicao</code>', 'ao ligar e em resposta a <code>?</code>'],
    ['<code>POS H &lt;linha&gt; &lt;coluna&gt;</code> · <code>POS V …</code>', 'modo posição: um controle passou para outra faixa'],
    ['<code>MOVER H D|E|C|B</code> · <code>MOVER V …</code>', 'modo joystick: direita, esquerda, cima, baixo'],
    ['<code>BOTAO REMOVER</code> · <code>BOTAO VOLTAR</code> · <code>BOTAO SOLUCAO</code>', 'botão apertado (debounce de 25 ms)'],
    ['<code>OK</code>', 'quadro de LEDs recebido e aplicado'],
    ['<code>ERRO quadro_invalido</code> · <code>ERRO comando_desconhecido</code> · <code>ERRO linha_longa</code>', 'linha recebida fora do protocolo'],
  ], 'mensagens enviadas pelo firmware')}
${tabela(['Código no quadro', 'LED'], [
    ['<code>.</code>', 'apagado (quebrado ou removido)'],
    ['<code>w</code>', 'branco (removível)'],
    ['<code>r</code>', 'vermelho (bloqueado)'],
    ['<code>c</code>', 'ciano (solução)'],
    ['<code>g</code>', 'verde (vitória)'],
    ['<code>*</code>', 'cursor, branco piscando a cada 300 ms'],
  ], 'quadro de LEDs: o computador envia <code>L</code> seguido de 40 códigos, um por LED, na ordem da corrente')}
<p><b>Controle de fluxo.</b> <code>leds.show()</code> desliga as interrupções do ATmega328P por cerca de 1,2 ms, e
bytes que chegam pela serial nesse intervalo se perdem. Por isso o computador só manda um quadro por vez: o
próximo sai depois do <code>OK</code>, e um <code>ERRO</code> ou 400 ms de silêncio fazem reenviar. Quadros pedidos
enquanto um está em trânsito não formam fila; vale só o mais recente.</p>
<h3>Configuração</h3>
${tabela(['Constante', 'Padrão', 'Para que serve'], [
    ['<code>POTENCIOMETROS_LIGADOS</code>', 'false', 'com A0–A3 soltos a leitura é ruído; mudar para true depois de ligar os potenciômetros'],
    ['<code>MODO_POSICAO</code>', 'true', 'true: a posição de cada potenciômetro escolhe o palito; false: imita um joystick'],
    ['<code>INVERTER[4]</code>', 'todos false', 'inverte o sentido de um eixo, na ordem H-X, H-Y, V-X, V-Y'],
    ['<code>HISTERESE</code>', '25', 'margem para trocar de faixa, evita o cursor tremer na divisa'],
    ['<code>DEBOUNCE_MS</code>', '25', 'tempo que o botão precisa ficar estável para contar'],
    ['<code>BRILHO</code>', '80', 'brilho dos LEDs, de 0 a 255'],
  ], 'constantes ajustáveis no início do firmware')}
<h3>Validação com o Uno real</h3>
${tabela(['Verificação', 'Resultado'], [
    ['<code>node tools/verificar-tabuleiro.mjs</code>: cursor, protocolo e conexão contra um Uno simulado que perde bytes', '63 de 63'],
    ['firmware pela serial (sem navegador): anúncio, comandos válidos e inválidos', '<code>PRONTO</code> em 1,6 s; cada erro com o motivo certo'],
    ['300 quadros seguidos, esperando o <code>OK</code>', '300 de 300 confirmados, ≈ 9,5 ms por quadro'],
    ['30 quadros seguidos <b>sem</b> esperar o <code>OK</code>', '15 OK e 15 ERRO: confirma a necessidade do controle de fluxo'],
    ['3 s com controles soltos e cursor piscando', 'nenhum evento falso'],
    ['jogo no Chrome conectado: teclado, solução, vitória, troca de tamanho', '21 quadros confirmados, nenhum reenvio'],
    ['botões simulados com jumper entre D2/D3/D4 e GND', 'REMOVER, VOLTAR e SOLUÇÃO chegaram ao jogo com o efeito certo'],
  ], 'testes da ponte com o Arduino Uno (sem LEDs e sem potenciômetros ligados)')}

<h2>Firmware de teste (Tinkercad)</h2>
<p>O sketch está em <code>hardware/broken_grid/broken_grid.ino</code>, num único arquivo porque o editor do
Tinkercad aceita apenas um. Ele roda a partida inteira no Arduino, com a mesma lógica do jogo do navegador sobre
máscaras de 64 bits — um bit por palito, na ordem da corrente de LEDs:</p>
<ul>
  <li><b>Quadrados:</b> os 30 quadrados (16 de 1×1, 9 de 2×2, 4 de 3×3, 1 de 4×4) são montados no
  <code>setup</code>. Um quadrado está vivo enquanto nenhum lado está quebrado ou removido — bloqueados contam
  como presentes.</li>
  <li><b>Grades:</b> as 20 grades de <code>data/grids/4x4.json</code> ficam na flash (PROGMEM) como duas máscaras
  cada, quebrados e bloqueados. O bloco é gerado por <code>node tools/gerar-grades-arduino.mjs</code>.</li>
  <li><b>Solução:</b> ao carregar cada grade, roda a formulação de <code>src/solver/</code> — guloso como teto e
  <i>branch and bound</i> no quadrado com menos palitos removíveis, com cota inferior de quadrados disjuntos e
  orçamento de 20 mil nós.</li>
  <li><b>Entradas:</b> joysticks, botões e comandos seriais passam pelas mesmas funções. A grade fica congelada no
  modo solução e depois da vitória.</li>
  <li><b>Joysticks:</b> o centro de cada eixo é medido ao ligar (por isso os joysticks devem estar soltos no
  reset); valor alto em X = direita, alto em Y = para baixo (<code>INVERTER_X</code>/<code>INVERTER_Y</code> para
  joystick montado girado). Na diagonal vale o eixo mais empurrado.</li>
</ul>
${tabela(['Verificação', 'Resultado'], [
    ['mínimo calculado pelo sketch × solver do jogo, 20 grades 4×4', '20 de 20 idênticos (sketch compilado no PC com stubs da API do Arduino)'],
    ['compilação para Arduino Uno (arduino-cli)', 'compila'],
    ['simulação no Tinkercad', 'botões, joystick, modo solução e ordem dos LEDs conferidos no circuito salvo'],
  ], 'validação do firmware de teste')}

<h2>Integração com o software</h2>
<p>A integração se apoia em três contratos compartilhados com o jogo do navegador: os <b>identificadores de
palito</b> (<code>h:l:c</code> / <code>v:l:c</code>), o <b>dataset</b> (as mesmas 20 grades 4×4, geradas do
mesmo JSON) e a <b>formulação do solver</b>.</p>
<ol>
  <li><b>Tabuleiro final (pronto).</b> O jogo no Chrome/Edge abre a porta do Uno pela <b>Web Serial API</b>,
  pelo cartão “Tabuleiro físico” da página. O Uno envia os eventos dos controles e recebe a cor de cada um dos 40
  LEDs (seção 4); regras, cursor, cronômetro e estatísticas ficam no computador. No jogo, a ponte se divide em
  <code>src/tabuleiro/protocolo.js</code> (monta o quadro e interpreta as mensagens),
  <code>src/tabuleiro/serial.js</code> (conexão e controle de fluxo) e <code>src/core/cursor.js</code> (regras
  do cursor), todos sem DOM. Mouse, teclado e tabuleiro passam pelas mesmas ações do jogo; sem os controles, o
  teclado faz o papel deles (setas = H, W A S D = V, Enter = REMOVER, Backspace = VOLTAR, X = SOLUÇÃO). O tabuleiro
  só mostra grades 4×4: ao conectar o jogo muda para 4×4 e, em outros tamanhos, os LEDs ficam apagados.</li>
  <li><b>Protótipo do Tinkercad (pronto).</b> O sketch de teste joga sozinho e fala um protocolo de texto pela
  serial (9600 baud, um comando por linha), que permite jogar e acompanhar a partida pelo Monitor Serial.</li>
</ol>
${tabela(['Comando (computador → placa)', 'Efeito'], [
    ['<code>H D</code> · <code>H E</code> · <code>H C</code> · <code>H B</code>', 'joystick H para direita, esquerda, cima, baixo'],
    ['<code>V D</code> · <code>V E</code> · <code>V C</code> · <code>V B</code>', 'joystick V, mesmas direções'],
    ['<code>REMOVER</code>', 'remove o palito sob o cursor'],
    ['<code>REMOVER h:1:2</code>', 'leva o cursor ao palito indicado e o remove'],
    ['<code>VOLTAR</code>', 'desfaz a última remoção (uma vez por jogada)'],
    ['<code>SOLUCAO</code>', 'liga ou desliga o modo solução'],
    ['<code>NOVA</code>', 'carrega a próxima grade do dataset'],
    ['<code>GRADE 7</code>', 'carrega a grade g4-007 (reproduz uma partida específica, RNF05)'],
    ['<code>ESTADO</code>', 'pede uma fotografia completa da partida'],
  ], 'comandos aceitos pelo sketch de teste do Tinkercad',
  'O Monitor Serial do Tinkercad envia o texto sem quebra de linha; o sketch considera o comando encerrado após 400 ms sem novos caracteres (com a aba em segundo plano, o Tinkercad entrega os caracteres espaçados).')}
${tabela(['Evento (placa → computador)', 'Exemplo'], [
    ['início', '<code>BROKEN_GRID tinkercad v2 n=4</code>'],
    ['grade carregada', '<code>GRADE g4-001 minimo=6 provado=1 nos=… solver_ms=… vivos=14</code>'],
    ['cursor', '<code>CURSOR h:0:0</code> (só quando muda de palito)'],
    ['remoção', '<code>REMOVIDO h:0:2 removidos=1 vivos=12</code>'],
    ['recusa', '<code>RECUSADO motivo=nao_removivel</code> · <code>RECUSADO desfazer motivo=indisponivel</code>'],
    ['desfazer', '<code>DESFEITO h:0:2 removidos=0 vivos=14</code>'],
    ['solução', `<code>SOLUCAO on minimo=6 provado=1 palitos=${SOLUCAO_G4_001.join(',')}</code> · <code>SOLUCAO off</code>`],
    ['vitória', '<code>VITORIA tempo_ms=… removidos=6 minimo=6 excedentes=0 eficiencia=100.00 percurso=…</code>'],
    ['fotografia', '<code>ESTADO removidos=0 vivos=14 vitoria=0 palitos=rrrr… cursor=h:0:0</code>'],
    ['erro', '<code>ERRO id_invalido</code> · <code>ERRO grade_invalida</code> · <code>ERRO direcao_invalida</code> · <code>ERRO comando_desconhecido</code>'],
  ], 'eventos emitidos pelo sketch de teste do Tinkercad',
  'Em <code>ESTADO</code>, cada caractere de <code>palitos</code> é um LED na ordem da corrente: r removível, b bloqueado, q quebrado, x removido. O evento VITORIA traz o resumo de fim de partida da especificação: tempo, removidos, mínimo, excedentes, eficiência e percurso.')}
${tabela(['Requisito', 'Como o hardware atende'], [
    ['RF02 / RF11 / RNF05', 'grades pré-validadas do dataset, com id; <code>GRADE n</code> reproduz uma partida'],
    ['RF03 / RF05', 'controles H/V + REMOVER; o cursor nem para em bloqueados e quebrados'],
    ['RF04 / RF06', 'quadrados vivos recalculados a cada jogada; vitória quando não resta nenhum'],
    ['RF07', 'contador de removidos em cada evento REMOVIDO / DESFEITO'],
    ['RF08 / RF12', 'botão SOLUÇÃO mostra a solução mínima em ciano sobre a grade inicial'],
    ['RF09', 'nova partida pelo computador (botão “Novo Grid”; no Tinkercad: <code>NOVA</code> ou <code>GRADE n</code>)'],
    ['RF13', 'VOLTAR desfaz só a última remoção; o cursor volta ao palito restaurado'],
  ], 'rastreabilidade com os requisitos do jogo')}

<h2>Protótipo digital no Tinkercad</h2>
<p>O circuito completo está salvo na conta da equipe como <b>“Broken Grid 4x4 - Tabuleiro (Tinkercad)”</b>
(<code>${URL_TINKERCAD}</code>), com o sketch já carregado e legendas no próprio circuito.</p>
<h3>O que tem no circuito</h3>
<ul>
  <li><b>LEDs:</b> 40 NeoPixels, um no meio de cada palito, ligados em zigue-zague exatamente como serão soldados
  (Figura 3), com três fios entre cada LED. As fileiras de 4 LEDs são palitos horizontais; as de 5, verticais.</li>
  <li><b>Arduino Uno R3</b>, a mesma placa da montagem: D6 → 330 Ω → LED 0.</li>
  <li><b>Controles:</b> 4 potenciômetros, da esquerda para a direita: H-X (A0), H-Y (A1), V-X (A2), V-Y (A3).</li>
  <li><b>Botões:</b> 3, entre o pino e o GND: REMOVER (D2), VOLTAR (D3), SOLUÇÃO (D4).</li>
</ul>
${tabela(['Diferença', 'No Tinkercad', 'Na montagem real', 'Motivo'], [
    ['alimentação dos LEDs', '5V do Arduino', 'fonte 5 V / 3 A, capacitor 1000 µF, GND comum', 'a “Fonte de energia” deixa a simulação ~30× mais lenta (1,5 % contra 50 % do tempo real); o capacitor também pesa'],
    ['onde roda o jogo', 'no próprio Arduino', 'no computador; o Uno é só periférico', 'o Tinkercad não tem Web Serial com o navegador'],
    ['controles', 'potenciômetros lidos como joystick (centro calibrado, zona morta ±200)', 'potenciômetros em modo posição (faixas)', 'o sketch segue a especificação original, com KY-023'],
    ['cores', 'cursor amarelo, removido azul', 'cursor branco, removido apagado', 'branco aceso ≈ apagado na tela do simulador (<code>CORES_DO_SIMULADOR</code>)'],
    ['calibração', 'centro medido no <code>setup</code>', 'não precisa no modo posição', 'girar um potenciômetro durante a simulação grava a posição no projeto'],  ], 'o que o simulador obrigou a fazer diferente',
  'Também por causa do Tinkercad, as assinaturas de função do sketch usam só tipos nativos: o editor insere os protótipos na linha 1, antes de qualquer typedef, enum ou struct.')}

<h3>Como simular</h3>
<ol class="passos">
  <li>Abra o projeto e deixe a aba <b>visível</b> o tempo todo: em segundo plano o Chrome desacelera a simulação
  para cerca de 2 % do tempo real. Feche outras abas do Tinkercad que estejam simulando.</li>
  <li>Dê zoom na grade de LEDs <b>antes</b> de iniciar (durante a simulação o zoom não funciona). Deixe os
  potenciômetros no meio.</li>
  <li>Abra <i>Código → Monitor serial</i> e clique em <i>Iniciar simulação</i>. Devem aparecer
  <code>BROKEN_GRID tinkercad v2 n=4</code>, <code>GRADE g4-001 minimo=6 provado=1 …</code> e
  <code>CURSOR h:0:0</code>.</li>
  <li>Para mexer num joystick, clique no knob do potenciômetro e arraste para girar; volte ao meio para parar.</li>
</ol>

<h3>Roteiro da demonstração</h3>
<ol class="passos">
  <li>Inicie a simulação: a grade g4-001 acende (branco = removível, vermelho = bloqueado) e o cursor pisca em
  amarelo no canto superior esquerdo (<code>h:0:0</code>).</li>
  <li>Gire os potenciômetros do joystick H para andar pelos horizontais e os do V para trocar para os verticais,
  seguindo a Figura 4: o cursor pula os palitos vermelhos e os quebrados.</li>
  <li>Aperte REMOVER: o palito fica azul (apagado na placa real) e o cursor vai para o removível mais próximo.
  Aperte VOLTAR: o palito volta e o cursor vai para ele. Aperte VOLTAR de novo: a serial responde
  <code>RECUSADO desfazer motivo=indisponivel</code>, porque o desfazer vale só para a última jogada (RF13).</li>
  <li>Pela serial, envie <code>REMOVER h:1:1</code> (um bloqueado): a resposta é
  <code>RECUSADO motivo=nao_removivel</code> (UC04).</li>
  <li>Aperte SOLUÇÃO: os 6 palitos da solução mínima acendem em ciano sobre a grade inicial e os controles de
  jogada ficam congelados. Aperte de novo para voltar ao jogo onde estava.</li>
  <li>Termine a partida. O caminho mais curto pelo Monitor Serial é enviar, um por vez:
  ${SOLUCAO_G4_001.map((id) => `<code>REMOVER ${id}</code>`).join(', ')}. A grade fica verde e a serial imprime o
  resumo <code>VITORIA … eficiencia=100.00</code>.</li>
  <li>Envie <code>NOVA</code> (ou <code>GRADE n</code>) para carregar outra grade.</li>
</ol>

<h2>Montagem física</h2>
<h3>Estrutura impressa em 3D</h3>
<ul>
  <li>Palitos de 30 × 3 mm que não se encostam nos cantos: passo de 38 mm entre cantos, com 2,5 mm de folga em
  cada canto.</li>
  <li>Tampa de 180 × 180 mm com 40 rasgos de 30 × 6 mm; embaixo de cada rasgo, um encaixe redondo de 11 mm × 1,4 mm
  de profundidade para o LED; 4 furos M3 com rebaixo nos cantos.</li>
  <li>Centros dos palitos (origem no canto da placa): horizontais em X 33/71/109/147 e Y 166/128/90/52/14;
  verticais em X 14/52/90/128/166 e Y 147/109/71/33.</li>
  <li>Base/caixa com o Arduino e a fiação, tampa inferior parafusada e painel frontal com os controles e os
  botões.</li>
</ul>
<h3>Fiação e testes</h3>
<ul>
  <li>Entre os LEDs: silicone 26 AWG em três cores — vermelho = 5V, preto = GND, terceira cor = dados. Os dois +5V
  de cada plaquinha são ligados entre si, assim como os dois GND.</li>
  <li>Da fonte até o primeiro LED: 22 AWG vermelho e preto. Potenciômetros e botões até o Arduino: jumpers Dupont
  fêmea-fêmea; botões com faston 4,8 mm ou solda.</li>
  <li><b>LEDs:</b> a cada 10 LEDs soldados, gravar <code>hardware/teste_leds/teste_leds.ino</code>. Ele acende um
  LED de cada vez na ordem da corrente (horizontais em branco, verticais em azul) e imprime no Monitor Serial, a
  9600 baud, qual palito deveria acender, para conferir a ordem da Figura 3. Comandos: <code>N 10</code> (quantos
  LEDs já estão soldados), <code>P</code> (pausa), <code>T</code> (todos acesos, teste de alimentação) e um número
  (acende só aquele LED).</li>
  <li><b>Controles:</b> antes de fechar a caixa, gravar <code>hardware/teste_controles/teste_controles.ino</code>.
  Ele mostra a leitura de cada potenciômetro, a faixa e o palito para onde cada controle aponta, além dos botões
  apertados. Se um eixo andar ao contrário, marcar a posição dele em <code>INVERTER</code> no firmware.</li>
</ul>
<h3 id="prototipo">Renderização conceitual</h3>
<p>A renderização abaixo é o protótipo conceitual da carcaça em camadas, desenhado em 7×7. Para o 4×4 a mesma ideia
encolhe para 40 palitos; em 7×7 seriam 112 LEDs e 140 quadrados, que continuam viáveis porque o solver roda no
computador e o Arduino só repassa cores e eventos. O quadro de LEDs, porém, cresceria para 112 códigos e não cabe
no buffer de linha de 64 bytes do firmware atual.</p>
${figura(`<img src="${foto}" alt="Protótipo físico em vista explodida" class="foto">`, 'protótipo conceitual da carcaça em vista explodida (renderização da equipe, versão 7×7).')}

<h2>Pendências</h2>
<ul>
  <li>Ligar os potenciômetros, mudar <code>POTENCIOMETROS_LIGADOS</code> para true e conferir o sentido de cada
  eixo (<code>INVERTER</code>) e a <code>HISTERESE</code> com os controles montados.</li>
  <li>Conferir o <code>DEBOUNCE_MS</code> com os botões de fliperama: cada aperto deve gerar um único evento.</li>
  <li>Validar a ordem e as cores da corrente de LEDs na grade soldada.</li>
  <li>Decidir se o cronômetro pausa no modo solução.</li>
  <li>Decidir se ver a solução marca a partida como “com ajuda”.</li>
  <li>Decidir o que o tabuleiro mostra antes de começar uma partida.</li>
</ul>

</body></html>`;
}

const CSS = `
@page { size: A4; margin: 20mm 18mm 20mm 18mm;
  @bottom-center { content: counter(page); font: 9pt "Segoe UI", Arial, sans-serif; color: #6b6a66; } }
@page :first { @bottom-center { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 10.5pt/1.5 Cambria, Georgia, "Times New Roman", serif; color: #1b1b1a; background: #ffffff; }
h1, h2, h3, .instituicao, .subtitulo, .meta, figcaption, .tabela__titulo, .nota, table, .formula {
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
h2.sem-numero::before { content: none; }
h3 { font-size: 11pt; margin: 5mm 0 1.5mm; break-after: avoid; counter-increment: subsecao; }
h3::before { content: counter(secao) "." counter(subsecao) " "; }
p { margin: 0 0 2.6mm; text-align: justify; hyphens: auto; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; text-align: justify; }
ol.passos li { break-inside: avoid; }
a { color: inherit; }
.resumo { background: #f4f3f0; border-left: 3px solid #2a78d6; padding: 3.5mm 5mm 1.5mm; margin-bottom: 4mm; }
.resumo h2 { margin-top: 0; }
code { font: 8.8pt Consolas, "Courier New", monospace; background: #f0efec; padding: 0 1.2mm; border-radius: 2px; }
.formula { text-align: center; font-size: 10pt; margin: 1.5mm 0 3mm; white-space: pre; }
figure { margin: 4mm 0 5mm; break-inside: avoid; text-align: center; }
figure svg { max-width: 100%; height: auto; }
figcaption { font-size: 8.5pt; color: #52514e; margin-top: 1.5mm; line-height: 1.4; text-align: left; }
.telas { display: flex; justify-content: center; gap: 7mm; }
.telas .rotulo { font: 600 10px "Segoe UI", Arial, sans-serif; fill: #3a3936; }
.foto { max-width: 70%; border-radius: 3px; }
.tabela { margin: 3mm 0 5mm; break-inside: avoid; }
.tabela__titulo { font-size: 8.5pt; color: #3a3936; margin-bottom: 1.5mm; text-align: left; }
table.dados { width: 100%; border-collapse: collapse; font-size: 8pt; }
table.dados th, table.dados td { padding: 1.1mm 1.6mm; border-bottom: 1px solid #e6e5e1; text-align: left; vertical-align: top; }
table.dados thead th { border-bottom: 1.5px solid #1b1b1a; font-weight: 600; }
table.dados code { font-size: 7.6pt; }
.nota { font-size: 8pt; color: #6b6a66; margin-top: 1.5mm; }
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
  const arquivoHtml = resolve(os.tmpdir(), `broken-grid-hardware-${process.pid}.html`);
  await writeFile(arquivoHtml, html, 'utf8');
  await promisify(execFile)(chrome, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--no-first-run',
    '--allow-file-access-from-files',
    `--user-data-dir=${resolve(os.tmpdir(), `broken-grid-chrome-${process.pid}`)}`,
    `--print-to-pdf=${destino}`,
    pathToFileURL(arquivoHtml).href,
  ], { timeout: 120000 });
}

function lerArgumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : process.argv[i + 1];
}

const destino = resolve(RAIZ, lerArgumento('saida', 'docs/hardware/especificacao-hardware.pdf'));
const html = lerArgumento('html', null);
const documento = await montarHtml();
if (html) await writeFile(resolve(RAIZ, html), documento, 'utf8');
await mkdir(dirname(destino), { recursive: true });
await imprimirPdf(documento, destino);
console.log(`PDF gravado em ${destino}`);
