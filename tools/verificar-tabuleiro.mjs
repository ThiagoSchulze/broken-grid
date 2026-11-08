// Uso: node tools/verificar-tabuleiro.mjs
//
// Confere a ponte com o tabuleiro físico sem precisar do Arduino:
//   - regras do cursor (src/core/cursor.js), incluindo o percurso da Figura 4 da
//     especificação do hardware;
//   - protocolo (src/tabuleiro/protocolo.js): quadro de LEDs e leitura dos eventos;
//   - conexão Web Serial (src/tabuleiro/serial.js) contra um "Uno falso" que segue o mesmo
//     protocolo de hardware/broken_grid_periferico, inclusive perdendo bytes de propósito.

import { readFileSync } from 'node:fs';
import { criarPartida, estadoInicial } from '../src/core/engine.js';
import {
  indiceNaCorrente, ordemDaCorrente, primeiroRemovivel, maisProximo, moverCursor, cursorValido,
} from '../src/core/cursor.js';
import { montarQuadro, interpretarLinha } from '../src/tabuleiro/protocolo.js';
import { criarConexao, suportaWebSerial } from '../src/tabuleiro/serial.js';

let total = 0;
let falhas = 0;

function checar(nome, condicao, detalhe = '') {
  total += 1;
  if (condicao) {
    console.log(`  ok    ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? `: ${detalhe}` : ''}`);
  }
}

function secao(titulo) {
  console.log(`\n== ${titulo}`);
}

const dataset4 = JSON.parse(readFileSync(new URL('../data/grids/4x4.json', import.meta.url), 'utf8'));
const g4001 = dataset4.grids.find((g) => g.id === 'g4-001');
const configG4001 = { id: g4001.id, n: 4, quebrados: g4001.quebrados, bloqueados: g4001.bloqueados };

async function principal() {
  verificarCorrente();
  verificarCursor();
  verificarProtocolo();
  await verificarConexao();

  console.log(`\n${total - falhas}/${total} verificacoes passaram`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

// ------------------------------------------------------------------ corrente de LEDs

function verificarCorrente() {
  secao('corrente de LEDs');

  checar('h:r:c -> 9r + c', indiceNaCorrente('h:2:3', 4) === 21 && indiceNaCorrente('h:4:0', 4) === 36);
  checar('v:r:c -> 9r + 4 + (4 - c)', indiceNaCorrente('v:0:4', 4) === 4 && indiceNaCorrente('v:3:0', 4) === 35);

  for (const n of [4, 5, 6, 7]) {
    const ordem = ordemDaCorrente(n);
    const ok = ordem.length === 2 * n * (n + 1) && ordem.every((id, i) => indiceNaCorrente(id, n) === i);
    checar(`${n}x${n}: ordem da corrente cobre 0..${2 * n * (n + 1) - 1} sem repetir`, ok);
  }
}

// ------------------------------------------------------------------ cursor

function verificarCursor() {
  secao('cursor (Figura 4 da especificação, grade g4-001)');

  const e = criarPartida(configG4001).obterEstado();
  let c = primeiroRemovivel(e);
  checar('1. início no primeiro removível da corrente', c === 'h:0:0', c);
  c = moverCursor(e, c, 'direita');
  checar('2. DIREITA -> h:0:1', c === 'h:0:1', c);
  c = moverCursor(e, c, 'baixo');
  checar('3. BAIXO desce para a fileira de verticais, pula v:0:1 quebrado -> v:0:2', c === 'v:0:2', c);
  c = moverCursor(e, c, 'baixo');
  checar('4. BAIXO volta aos horizontais, pula bloqueados e quebrado -> h:1:0', c === 'h:1:0', c);
  c = moverCursor(e, c, 'direita');
  checar('5. DIREITA sem outro removível na fileira fica parado -> h:1:0', c === 'h:1:0', c);
  c = moverCursor(e, c, 'baixo');
  checar('6. BAIXO -> v:1:0', c === 'v:1:0', c);

  secao('cursor: regras');

  const limpa = criarPartida({ id: 'l', n: 4, quebrados: [], bloqueados: [] }).obterEstado();
  checar('DIREITA no fim da fileira volta ao começo', moverCursor(limpa, 'h:0:3', 'direita') === 'h:0:0');
  checar('fileira vertical tem 5 palitos', moverCursor(limpa, 'v:0:3', 'direita') === 'v:0:4'
    && moverCursor(limpa, 'v:0:4', 'direita') === 'v:0:0');
  checar('BAIXO alterna horizontais e verticais na mesma coluna',
    moverCursor(limpa, 'h:1:2', 'baixo') === 'v:1:2' && moverCursor(limpa, 'v:1:2', 'baixo') === 'h:2:2');
  checar('BAIXO da última fileira volta à primeira', moverCursor(limpa, 'h:4:1', 'baixo') === 'h:0:1');
  checar('BAIXO do vertical da ponta vai para o horizontal mais perto', moverCursor(limpa, 'v:2:4', 'baixo') === 'h:3:3');
  let volta = 'h:0:3';
  const percurso = [];
  for (let i = 0; i < 9; i += 1) { volta = moverCursor(limpa, volta, 'baixo'); percurso.push(volta); }
  checar('9 vezes BAIXO passa pelas 9 fileiras sem escorregar de coluna', volta === 'h:0:3'
    && percurso.every((id) => id.endsWith(':3')), percurso.join(' '));
  checar('teclado: esquerda e cima fazem o inverso', moverCursor(limpa, 'h:0:0', 'esquerda') === 'h:0:3'
    && moverCursor(limpa, 'h:0:1', 'cima') === 'h:4:1' && moverCursor(limpa, 'v:1:2', 'cima') === 'h:1:2');
  const semV0 = criarPartida({
    id: 's', n: 4, quebrados: ['v:0:0', 'v:0:1', 'v:0:2', 'v:0:3', 'v:0:4'], bloqueados: [],
  }).obterEstado();
  checar('fileira sem removível é pulada', moverCursor(semV0, 'h:0:0', 'baixo') === 'h:1:0');
  checar('direção desconhecida não mexe', moverCursor(limpa, 'h:0:0', 'pular') === 'h:0:0');

  const partida = criarPartida(configG4001);
  partida.removerPalito('h:0:2');
  const depois = partida.obterEstado();
  const prox = maisProximo(depois, 'h:0:2');
  checar('depois de remover vai para um removível', depois.palitos[prox] === 'removivel', prox);
  checar('cursor removido é corrigido', cursorValido(depois, 'h:0:2') === prox);
  checar('sem cursor começa no primeiro removível', cursorValido(depois, null) === 'h:0:0');

  // percorrendo a grade inteira só com DIREITA e BAIXO, o cursor nunca para fora de removível
  let p = primeiroRemovivel(e);
  let sempreRemovivel = true;
  for (let i = 0; i < 200; i += 1) {
    p = moverCursor(e, p, i % 3 === 0 ? 'baixo' : 'direita');
    if (e.palitos[p] !== 'removivel') sempreRemovivel = false;
  }
  checar('nunca para em palito não removível', sempreRemovivel, p);
}

// ------------------------------------------------------------------ protocolo

function verificarProtocolo() {
  secao('protocolo: quadro de LEDs');

  const original = estadoInicial(configG4001);
  const partida = criarPartida(configG4001);
  const jogo = partida.obterEstado();

  const q = montarQuadro({ estado: jogo, estadoOriginal: original, vista: 'jogo', cursor: 'h:0:0' });
  checar('formato "L " + 40 códigos', /^L [.wrcg*]{40}$/.test(q), q);
  const cod = q.slice(2);
  checar('cursor no LED 0', cod[0] === '*');
  checar('bloqueado h:1:1 em vermelho (LED 10)', cod[10] === 'r');
  checar('quebrado v:0:1 apagado (LED 7)', cod[7] === '.');
  checar('removível h:0:1 em branco (LED 1)', cod[1] === 'w');

  partida.removerPalito('h:0:2');
  const comRemovido = montarQuadro({ estado: partida.obterEstado(), vista: 'jogo', cursor: null }).slice(2);
  checar('removido apagado (LED 2)', comRemovido[2] === '.');

  const sol = montarQuadro({
    estado: partida.obterEstado(), estadoOriginal: original, vista: 'solucao', solucao: ['h:0:2', 'v:3:1'], cursor: 'h:0:0',
  }).slice(2);
  checar('modo solução: palitos da solução em ciano', sol[2] === 'c' && sol[indiceNaCorrente('v:3:1', 4)] === 'c');
  checar('modo solução: sem cursor', !sol.includes('*'));
  checar('modo solução: usa a grade inicial (bloqueado continua vermelho)', sol[10] === 'r');

  for (const id of ['h:2:0', 'v:2:2', 'h:3:2', 'h:3:3', 'v:3:1']) partida.removerPalito(id);
  const vit = partida.obterEstado();
  const qv = montarQuadro({ estado: vit, vista: 'jogo', cursor: 'h:0:0' }).slice(2);
  checar('a solução da especificação vence g4-001', vit.status === 'vencido');
  checar('vitória: presentes em verde, resto apagado', [...qv].every((c) => c === 'g' || c === '.') && qv.includes('g'));

  const grande = criarPartida({ id: 'x', n: 5, quebrados: [], bloqueados: [] }).obterEstado();
  checar('grade que não é 4x4: tudo apagado', montarQuadro({ estado: grande }) === `L ${'.'.repeat(40)}`);
  checar('sem estado: tudo apagado', montarQuadro({ estado: null }) === `L ${'.'.repeat(40)}`);

  secao('protocolo: eventos do Uno');

  const pr = interpretarLinha('PRONTO broken-grid-periferico v2 n=4 modo=botoes');
  checar('PRONTO', pr.tipo === 'pronto' && pr.versao === 'v2' && pr.n === 4 && pr.modo === 'botoes');
  checar('OK', interpretarLinha('OK').tipo === 'ok');
  checar('ERRO', interpretarLinha('ERRO quadro_invalido').motivo === 'quadro_invalido');
  checar('BOTAO DIREITA (com \\r)', interpretarLinha('BOTAO DIREITA\r').botao === 'direita');
  checar('BOTAO BAIXO', interpretarLinha('BOTAO BAIXO').botao === 'baixo');
  checar('BOTAO SOLUCAO', interpretarLinha('BOTAO SOLUCAO').botao === 'solucao');
  checar('BOTAO NOVO', interpretarLinha('BOTAO NOVO').botao === 'novo');
  checar('lixo vira desconhecido', ['', 'MOVER H D', 'POS H 4 2', 'BOTAO toString', 'BOTAO PULAR', '\u0000OK'].every((l) => interpretarLinha(l).tipo === 'desconhecido'));
}

// ------------------------------------------------------------------ conexão

// Uno falso: mesmo protocolo do firmware. 'perda' = chance de perder cada byte vindo do PC
// (o que acontece de verdade quando leds.show() desliga as interrupções).
function criarUnoFalso({ perda = 0, responde = true, falhaAoAbrir = false, semente = 7 } = {}) {
  let s = semente;
  const aleatorio = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const uno = { leds: null, recebidos: 0, aberta: false, controlador: null };
  let linha = '';

  function enviar(texto) {
    uno.controlador?.enqueue(new TextEncoder().encode(texto));
  }

  function interpretar(l) {
    if (l === '?') { if (responde) enviar('PRONTO broken-grid-periferico v2 n=4 modo=botoes\n'); return; }
    if (l.startsWith('L ')) {
      const q = l.slice(2);
      if (q.length !== 40 || !/^[.wrcg*]+$/.test(q)) { enviar('ERRO quadro_invalido\n'); return; }
      uno.leds = q;
      uno.recebidos += 1;
      enviar('OK\n');
      return;
    }
    enviar('ERRO comando_desconhecido\n');
  }

  uno.porta = {
    async open() {
      if (falhaAoAbrir) throw new Error('porta ocupada');
      uno.aberta = true;
      this.readable = new ReadableStream({ start(c) { uno.controlador = c; } });
      this.writable = new WritableStream({
        write(bytes) {
          for (const b of bytes) {
            if (perda && aleatorio() < perda) continue;
            const ch = String.fromCharCode(b);
            if (ch === '\n') { if (linha.length > 62) enviar('ERRO linha_longa\n'); else if (linha) interpretar(linha); linha = ''; } else linha += ch;
          }
        },
      });
      // o Uno reinicia ao abrir a porta e anuncia que está pronto
      if (responde) setTimeout(() => enviar('PRONTO broken-grid-periferico v2 n=4 modo=botoes\n'), 20);
    },
    async close() { uno.aberta = false; },
  };
  uno.falar = enviar;
  uno.puxarCabo = () => uno.controlador.error(new Error('cabo'));
  return uno;
}

// relógio acelerado: os tempos da conexão (2,5 s, 400 ms...) passam 50x mais rápido
const relogioRapido = {
  setTimeout: (fn, ms) => setTimeout(fn, ms / 50),
  clearTimeout: (t) => clearTimeout(t),
};

const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function ate(condicao, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (condicao()) return true;
    await esperar(5);
  }
  return condicao();
}

function montarConexao(uno, { cancelarEscolha = false } = {}) {
  const eventos = [];
  const infos = [];
  const serial = {
    requestPort: async () => {
      if (cancelarEscolha) throw new DOMException('nenhuma porta', 'NotFoundError');
      return uno.porta;
    },
  };
  const conexao = criarConexao({ serial, aoEvento: (e) => eventos.push(e), aoMudar: (i) => infos.push(i), relogio: relogioRapido });
  return { conexao, eventos, infos, ultima: () => infos.at(-1) ?? {} };
}

function quadroAleatorio(i) {
  const cods = '.wrcg*';
  let q = '';
  for (let k = 0; k < 40; k += 1) q += cods[(i * 7 + k * 13 + ((i * k) % 5)) % 6];
  return `L ${q}`;
}

async function verificarConexao() {
  secao('conexão Web Serial (Uno falso)');

  checar('sem navigator.serial: não suportado', suportaWebSerial({}) === false);
  checar('com navigator.serial: suportado', suportaWebSerial({ serial: { requestPort() {} } }) === true);

  {
    const uno = criarUnoFalso();
    const { conexao, eventos, ultima } = montarConexao(uno);
    conexao.enviarQuadro(quadroAleatorio(0));  // antes de conectar: fica guardado
    await conexao.conectar();
    checar('conecta ao receber PRONTO', await ate(() => conexao.conectado()), ultima().situacao);
    checar('quadro guardado sai ao conectar', await ate(() => uno.leds === quadroAleatorio(0).slice(2)));

    conexao.enviarQuadro(quadroAleatorio(0));
    await esperar(30);
    checar('quadro repetido não é reenviado', uno.recebidos === 1, String(uno.recebidos));

    for (let i = 1; i <= 50; i += 1) conexao.enviarQuadro(quadroAleatorio(i));
    checar('rajada: o Uno termina com o quadro mais recente', await ate(() => uno.leds === quadroAleatorio(50).slice(2)));
    checar('rajada: quadros intermediários são pulados', uno.recebidos < 10, String(uno.recebidos));

    uno.falar('BOTAO DIREITA\nBOTAO BAIXO\nBOTAO REMOVER\nlixo qualquer\nBOTAO VOLTAR\n');
    await ate(() => eventos.length >= 4);
    checar('eventos chegam na ordem', eventos.map((e) => e.tipo + e.botao).join(',') === 'botaodireita,botaobaixo,botaoremover,botaovoltar',
      JSON.stringify(eventos));
    checar('último evento aparece no painel', ultima().ultimoEvento === 'BOTAO VOLTAR');

    uno.leds = null;
    uno.falar('PRONTO broken-grid-periferico v2 n=4 modo=botoes\n');
    checar('Uno reiniciou: quadro é reenviado', await ate(() => uno.leds === quadroAleatorio(50).slice(2)));

    await conexao.desconectar(`L ${'.'.repeat(40)}`);
    checar('desconectar apaga o tabuleiro', await ate(() => uno.leds === '.'.repeat(40)));
    checar('desconectar fecha a porta', !uno.aberta && conexao.situacao() === 'desconectado');
  }

  {
    const uno = criarUnoFalso({ perda: 0.05 });
    const { conexao, ultima } = montarConexao(uno);
    await conexao.conectar();
    await ate(() => conexao.conectado());
    let todos = true;
    for (let i = 0; i < 30; i += 1) {
      conexao.enviarQuadro(quadroAleatorio(100 + i));
      const chegou = await ate(() => uno.leds === quadroAleatorio(100 + i).slice(2), 4000);
      if (!chegou) { todos = false; break; }
    }
    checar('perdendo 5% dos bytes: todo quadro chega certo', todos);
    checar('perdendo bytes: houve reenvios', ultima().reenvios > 0, String(ultima().reenvios));
    await conexao.desconectar();
  }

  {
    const uno = criarUnoFalso({ responde: false });
    const { conexao, ultima } = montarConexao(uno);
    await conexao.conectar();
    checar('Uno sem o firmware: erro depois de perguntar', await ate(() => ultima().situacao === 'erro', 5000), ultima().situacao);
    checar('erro explica o que conferir', /broken_grid_periferico/.test(ultima().mensagem ?? ''));
    checar('porta é fechada', !uno.aberta);
  }

  {
    const { conexao, ultima } = montarConexao(criarUnoFalso(), { cancelarEscolha: true });
    await conexao.conectar();
    checar('cancelar a escolha da porta não é erro', ultima().situacao === 'desconectado');
  }

  {
    const { conexao, ultima } = montarConexao(criarUnoFalso({ falhaAoAbrir: true }));
    await conexao.conectar();
    checar('porta ocupada: erro sugere fechar o Monitor Serial', ultima().situacao === 'erro' && /Monitor Serial/.test(ultima().mensagem));
  }

  {
    const uno = criarUnoFalso();
    const { conexao, ultima } = montarConexao(uno);
    await conexao.conectar();
    await ate(() => conexao.conectado());
    uno.puxarCabo();
    checar('cabo puxado: volta a desconectado com aviso', await ate(() => ultima().situacao === 'desconectado' && /caiu/.test(ultima().mensagem)));
    await conexao.conectar();
    checar('dá para conectar de novo', await ate(() => conexao.conectado()));
    await conexao.desconectar();
  }
}

await principal();
