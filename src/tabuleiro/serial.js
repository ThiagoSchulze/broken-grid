// Ponte Web Serial com o Arduino (firmware hardware/broken_grid_periferico).
// Não toca no DOM: recebe a API serial por parâmetro, então também roda no Node com uma
// porta falsa (tools/verificar-tabuleiro.mjs).
//
// Controle de fluxo: só um quadro de LEDs "em voo" por vez. O próximo só sai depois do OK
// do Uno; ERRO ou silêncio fazem reenviar. Quadros que chegam enquanto um está em voo não
// formam fila: vale só o mais recente.

import { BAUD, interpretarLinha } from './protocolo.js';

const ESPERA_PRONTO_MS = 2500;   // o Uno reinicia ao abrir a porta e leva ~1 s para responder
const INTERVALO_PERGUNTA_MS = 1500;
const PERGUNTAS_MAX = 3;
const ESPERA_OK_MS = 400;

export function suportaWebSerial(nav = globalThis.navigator) {
  return Boolean(nav && nav.serial && typeof nav.serial.requestPort === 'function');
}

export function criarConexao({
  serial = globalThis.navigator?.serial,
  aoEvento = () => {},
  aoMudar = () => {},
  relogio = globalThis,
} = {}) {
  let situacao = 'desconectado';  // desconectado | conectando | conectado | erro
  let mensagem = '';
  let infoPronto = null;
  let porta = null;
  let leitor = null;
  let escritor = null;
  let fimDoPipe = null;
  let fechando = false;
  let filaEscrita = Promise.resolve();

  let desejado = null;        // quadro mais recente pedido pelo jogo
  let emVoo = null;           // quadro enviado aguardando OK
  let confirmado = null;      // último quadro que o Uno confirmou
  let timerOk = null;
  let timerPronto = null;
  let perguntas = 0;

  const contadores = { quadros: 0, reenvios: 0, eventos: 0 };
  let ultimoEvento = null;

  function informar() {
    aoMudar({ situacao, mensagem, pronto: infoPronto, ...contadores, ultimoEvento });
  }

  function mudar(nova, texto = '') {
    situacao = nova;
    mensagem = texto;
    informar();
  }

  function escrever(texto) {
    if (!escritor) return filaEscrita;
    const bytes = new TextEncoder().encode(`${texto}\n`);
    filaEscrita = filaEscrita.then(() => escritor.write(bytes)).catch(() => {});
    return filaEscrita;
  }

  function limparTimers() {
    relogio.clearTimeout(timerOk);
    relogio.clearTimeout(timerPronto);
    timerOk = null;
    timerPronto = null;
  }

  function tentarEnviar() {
    if (situacao !== 'conectado' || emVoo !== null || desejado === null) return;
    if (desejado === confirmado) return;
    emVoo = desejado;
    escrever(emVoo);
    timerOk = relogio.setTimeout(() => {
      // sem resposta: o quadro (ou o OK) se perdeu
      timerOk = null;
      emVoo = null;
      confirmado = null;
      contadores.reenvios += 1;
      tentarEnviar();
    }, ESPERA_OK_MS);
  }

  function aoReceberLinha(linha) {
    if (!linha.trim()) return;
    const evento = interpretarLinha(linha);

    if (evento.tipo === 'pronto') {
      infoPronto = evento;
      relogio.clearTimeout(timerPronto);
      timerPronto = null;
      // pronto de novo com a conexão aberta = o Uno reiniciou: manda o quadro outra vez
      relogio.clearTimeout(timerOk);
      timerOk = null;
      emVoo = null;
      confirmado = null;
      mudar('conectado', '');
      tentarEnviar();
      return;
    }

    if (evento.tipo === 'ok') {
      if (emVoo === null) return;
      relogio.clearTimeout(timerOk);
      timerOk = null;
      confirmado = emVoo;
      emVoo = null;
      contadores.quadros += 1;
      informar();
      tentarEnviar();
      return;
    }

    if (evento.tipo === 'erro') {
      if (emVoo !== null) {
        relogio.clearTimeout(timerOk);
        timerOk = null;
        emVoo = null;
        confirmado = null;
        contadores.reenvios += 1;
        tentarEnviar();
      }
      return;
    }

    if (evento.tipo === 'desconhecido') return;

    if (situacao !== 'conectado') return;
    contadores.eventos += 1;
    ultimoEvento = linha.trim();
    informar();
    aoEvento(evento);
  }

  async function lerSempre() {
    let resto = '';
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += value;
        let fim;
        while ((fim = resto.indexOf('\n')) >= 0) {
          const linha = resto.slice(0, fim).replace(/\r$/, '');
          resto = resto.slice(fim + 1);
          aoReceberLinha(linha);
        }
        if (resto.length > 512) resto = '';  // lixo sem quebra de linha
      }
    } catch {
      // leitura interrompida: cabo puxado ou porta fechada
    }
    if (!fechando) {
      await encerrar();
      mudar('desconectado', 'A conexão com o Arduino caiu. Confira o cabo USB e conecte de novo.');
    }
  }

  function perguntarSePronto() {
    timerPronto = relogio.setTimeout(() => {
      if (situacao !== 'conectando') return;
      if (perguntas >= PERGUNTAS_MAX) {
        encerrar().then(() => mudar('erro',
          'O Arduino não respondeu. Confira se o firmware broken_grid_periferico foi gravado nele.'));
        return;
      }
      perguntas += 1;
      escrever('?');
      perguntarSePronto();
    }, perguntas === 0 ? ESPERA_PRONTO_MS : INTERVALO_PERGUNTA_MS);
  }

  async function conectar() {
    if (situacao === 'conectando' || situacao === 'conectado') return;
    if (!serial) { mudar('erro', 'Este navegador não tem Web Serial. Use o Chrome ou o Edge.'); return; }

    let escolhida;
    try {
      escolhida = await serial.requestPort();
    } catch {
      mudar('desconectado', '');  // o usuário fechou a janela de escolha da porta
      return;
    }

    mudar('conectando', 'Abrindo a porta…');
    try {
      await escolhida.open({ baudRate: BAUD });
    } catch {
      mudar('erro', 'Não foi possível abrir a porta. Se o Monitor Serial da IDE do Arduino estiver aberto, feche-o e tente de novo.');
      return;
    }

    porta = escolhida;
    fechando = false;
    infoPronto = null;
    emVoo = null;
    confirmado = null;
    perguntas = 0;
    filaEscrita = Promise.resolve();
    const decodificador = new TextDecoderStream();
    fimDoPipe = porta.readable.pipeTo(decodificador.writable).catch(() => {});
    leitor = decodificador.readable.getReader();
    escritor = porta.writable.getWriter();
    mudar('conectando', 'Aguardando o Arduino…');
    lerSempre();
    perguntarSePronto();
  }

  async function encerrar() {
    fechando = true;
    limparTimers();
    emVoo = null;
    confirmado = null;
    const p = porta;
    porta = null;
    try { await leitor?.cancel(); } catch { /* já fechado */ }
    try { await fimDoPipe; } catch { /* idem */ }
    try { await filaEscrita; escritor?.releaseLock(); } catch { /* idem */ }
    try { await p?.close(); } catch { /* idem */ }
    leitor = null;
    escritor = null;
    fimDoPipe = null;
  }

  async function desconectar(quadroFinal = null) {
    if (!porta) { mudar('desconectado', ''); return; }
    if (quadroFinal && situacao === 'conectado') await escrever(quadroFinal);
    await encerrar();
    mudar('desconectado', '');
  }

  function enviarQuadro(texto) {
    desejado = texto;
    tentarEnviar();
  }

  return {
    conectar,
    desconectar,
    enviarQuadro,
    situacao: () => situacao,
    conectado: () => situacao === 'conectado',
  };
}
