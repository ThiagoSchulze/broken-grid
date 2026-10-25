import { criarPartida, estadoInicial } from '../core/engine.js';
import { calcularResumo } from '../core/metrics.js';
import { resolver, ErroSolver } from '../solver/index.js';
import { carregarDataset, escolherGrade, configDaGrade, ErroDataset } from '../dataset/loader.js';
import { criarStore } from './store.js';
import { criarTabuleiro } from './board.js';
import { criarControles } from './controls.js';
import { criarStats } from './stats.js';
import { criarBanners } from './banners.js';
import { criarDesempenho } from './performance.js';
import { criarComparacao } from './comparacao.js';
import { criarPainelTabuleiro } from './painel-tabuleiro.js';
import {
  cursorValido, maisProximo, moverCursor as regraMoverCursor, posicionarCursor, primeiroRemovivel,
} from '../core/cursor.js';
import { montarQuadro, N_DO_TABULEIRO } from '../tabuleiro/protocolo.js';
import { criarConexao, suportaWebSerial } from '../tabuleiro/serial.js';

const TAMANHO_INICIAL = 4;

// teclado no lugar dos controles do tabuleiro: setas = controle H, WASD = controle V
const TECLAS_H = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const TECLAS_V = { d: [1, 0], a: [-1, 0], w: [0, -1], s: [0, 1] };

export async function iniciarAplicacao(documento) {
  const elementos = {
    tabuleiro: documento.querySelector('#tabuleiro'),
    controles: documento.querySelector('#controles'),
    acoes: documento.querySelector('#acoes'),
    stats: documento.querySelector('#stats'),
    bannerSolucao: documento.querySelector('#banner-solucao'),
    cardVitoria: documento.querySelector('#card-vitoria'),
    desempenho: documento.querySelector('#desempenho'),
    erro: documento.querySelector('#erro'),
    cartaoTabuleiro: documento.querySelector('.cartao--tabuleiro'),
    painelTabuleiro: documento.querySelector('#painel-tabuleiro'),
  };

  const store = criarStore({
    vista: 'jogo',
    solucao: null,
    config: null,
    estadoOriginal: null,
    solucaoVisivel: false,
    cursor: null,
  });
  let jogo = null;
  let dataset = null;
  let buscaAtual = null;
  let infoConexao = { situacao: 'desconectado' };

  const tabuleiro = criarTabuleiro(elementos.tabuleiro, {
    aoAtivarPalito: (id) => remover(id),
  });
  const stats = criarStats(elementos.stats);
  const desempenho = criarDesempenho(elementos.desempenho);
  const comparacao = criarComparacao(elementos.desempenho, {
    aoAlternar: () => store.atualizar({ solucaoVisivel: !store.obter().solucaoVisivel }),
  });
  const banners = criarBanners(elementos.bannerSolucao, elementos.cardVitoria, {
    aoJogarNovamente: () => reiniciarGradeAtual(),
    aoVerDesempenho: () => {
      if (!store.obter().config) return;
      store.atualizar({ vista: 'desempenho' });
      limparErro();
    },
  });
  const controles = criarControles(elementos.controles, elementos.acoes, {
    aoEscolherTamanho: (n) => {
      if (!store.obter().config) return;
      trocarTamanho(n);
    },
    aoNovoGrid: () => reiniciarGradeAtual(),
    aoSolucionar: () => {
      if (!store.obter().config) return;
      mostrarSolucao();
    },
    aoVoltarJogo: () => {
      if (!jogo) return;
      store.atualizar({ vista: 'jogo' });
    },
    aoDesfazer: () => voltar(),
  });

  const conexao = criarConexao({
    aoEvento: (evento) => {
      if (evento.tipo === 'mover') moverCursor(evento.controle, evento.dx, evento.dy);
      else if (evento.tipo === 'pos') posicionar(evento.controle, evento.linha, evento.coluna);
      else if (evento.tipo === 'botao') {
        if (evento.botao === 'remover') remover();
        else if (evento.botao === 'voltar') voltar();
        else if (evento.botao === 'solucao') alternarSolucao();
      }
    },
    aoMudar: (info) => {
      const acabouDeConectar = info.situacao === 'conectado' && infoConexao.situacao !== 'conectado';
      infoConexao = info;
      // o tabuleiro físico é 4x4: ao conectar, o jogo vai para uma grade desse tamanho
      if (acabouDeConectar && store.obter().config?.n !== N_DO_TABULEIRO) trocarTamanho(N_DO_TABULEIRO);
      renderizarPainel();
    },
  });

  const painel = criarPainelTabuleiro(elementos.painelTabuleiro, {
    suportado: suportaWebSerial(),
    aoConectar: () => conexao.conectar(),
    aoDesconectar: () => conexao.desconectar(montarQuadro({ estado: null })),
  });

  function renderizarPainel() {
    const n = store.obter().config?.n;
    const aviso = infoConexao.situacao === 'conectado' && n && n !== N_DO_TABULEIRO
      ? `O tabuleiro físico só mostra grades ${N_DO_TABULEIRO}×${N_DO_TABULEIRO}; nos outros tamanhos os LEDs ficam apagados.`
      : '';
    painel.renderizar({ ...infoConexao, aviso });
  }

  // ------------------------------------------------------------ ações da jogada
  // Mouse, teclado e tabuleiro físico passam todos por aqui.

  function jogadaPermitida() {
    return Boolean(jogo) && store.obter().vista === 'jogo' && jogo.obterEstado().status !== 'vencido';
  }

  function cursorAtual() {
    return jogo ? cursorValido(jogo.obterEstado(), store.obter().cursor) : null;
  }

  function remover(id = cursorAtual()) {
    if (!jogadaPermitida() || !id) return;
    if (jogo.removerPalito(id).ok) store.atualizar({ cursor: maisProximo(jogo.obterEstado(), id) });
  }

  function voltar() {
    if (!jogo || store.obter().vista !== 'jogo') return;
    const restaurado = jogo.obterEstado().historico.at(-1);
    // ao desfazer, o cursor volta para o palito restaurado
    if (jogo.desfazer().ok) store.atualizar({ cursor: restaurado });
  }

  function alternarSolucao() {
    const { vista, config } = store.obter();
    if (!config) return;
    if (vista === 'solucao') store.atualizar({ vista: 'jogo' });
    else if (vista === 'jogo') mostrarSolucao();
  }

  function moverCursor(controle, dx, dy) {
    if (!jogadaPermitida()) return;
    const atual = cursorAtual();
    if (!atual) return;
    const novo = regraMoverCursor(jogo.obterEstado(), atual, controle, dx, dy);
    if (novo !== store.obter().cursor) store.atualizar({ cursor: novo });
  }

  function posicionar(controle, linha, coluna) {
    if (!jogadaPermitida()) return;
    const novo = posicionarCursor(jogo.obterEstado(), cursorAtual(), controle, linha, coluna);
    if (novo !== store.obter().cursor) store.atualizar({ cursor: novo });
  }

  documento.addEventListener('keydown', (evento) => {
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const alvo = evento.target;
    const emCampo = alvo instanceof Element && alvo.closest('input, select, textarea');
    if (emCampo) return;
    // Enter em botão ou palito focado já tem dono (o próprio botão / o tabuleiro SVG)
    const emControle = alvo instanceof Element && alvo.closest('button, [data-id]');
    const tecla = evento.key.length === 1 ? evento.key.toLowerCase() : evento.key;

    if (TECLAS_H[tecla] || TECLAS_V[tecla]) {
      if (store.obter().vista !== 'jogo') return;
      const [dx, dy] = TECLAS_H[tecla] ?? TECLAS_V[tecla];
      evento.preventDefault();
      moverCursor(TECLAS_H[tecla] ? 'h' : 'v', dx, dy);
    } else if (tecla === 'Enter' && !emControle) {
      evento.preventDefault();
      remover();
    } else if (tecla === 'Backspace') {
      evento.preventDefault();
      voltar();
    } else if (tecla === 'x') {
      evento.preventDefault();
      alternarSolucao();
    }
  });

  function relatarErro(mensagem) {
    elementos.erro.textContent = mensagem;
    elementos.erro.hidden = false;
  }

  function limparErro() {
    elementos.erro.textContent = '';
    elementos.erro.hidden = true;
  }

  function reiniciarGradeAtual() {
    const { config } = store.obter();
    if (!config) return;
    novaGrade(config.n);
  }

  async function trocarTamanho(n) {
    try {
      dataset = await carregarDataset(n);
      limparErro();
      novaGrade(n);
    } catch (erro) {
      relatarErro(erro instanceof ErroDataset
        ? `Não foi possível carregar as grades ${n}×${n}: ${erro.message}`
        : `Erro inesperado ao carregar as grades ${n}×${n}.`);
    }
  }

  function novaGrade(n) {
    const atual = store.obter().config;
    const grid = escolherGrade(dataset, { exceto: atual?.n === n ? atual.id : null });
    const config = configDaGrade(dataset, grid);

    if (jogo) {
      jogo.reiniciar(config);
    } else {
      jogo = criarPartida(config);
      jogo.inscrever(desenhar);
    }

    store.atualizar({
      vista: 'jogo',
      solucao: null,
      config,
      estadoOriginal: estadoInicial(config),
      solucaoVisivel: false,
      // nova partida: cursor no primeiro removível da corrente
      cursor: primeiroRemovivel(jogo.obterEstado()),
    });
    desenhar(jogo.obterEstado());
    dispararSolver(config);
  }

  function dispararSolver(config) {
    buscaAtual?.abort();
    const controlador = new AbortController();
    buscaAtual = controlador;

    const aplicar = (solucao) => {
      if (store.obter().config?.id !== config.id) return;
      store.atualizar({ solucao });
    };

    resolver(config, { sinal: controlador.signal, aoMelhorar: aplicar })
      .then(aplicar)
      .catch((erro) => {
        if (erro instanceof ErroSolver && erro.cancelado) return;
        relatarErro(`Não foi possível calcular a solução: ${erro.message}`);
      });
  }

  function mostrarSolucao() {
    if (!store.obter().solucao) return;
    store.atualizar({ vista: 'solucao' });
    limparErro();
  }

  function desenhar(estadoJogo = jogo?.obterEstado()) {
    if (!estadoJogo) return;
    const ui = store.obter();
    const emSolucao = ui.vista === 'solucao';
    const emDesempenho = ui.vista === 'desempenho';

    // no modo solucao a tela inteira descreve a grade original, nao a partida
    const estadoExibido = emSolucao ? (ui.estadoOriginal ?? estadoJogo) : estadoJogo;
    const emJogada = ui.vista === 'jogo' && estadoJogo.status !== 'vencido';
    const cursor = emJogada ? cursorValido(estadoJogo, ui.cursor) : null;

    tabuleiro.renderizar(estadoExibido, {
      solucao: emSolucao ? ui.solucao?.palitos : null,
      interativo: ui.vista === 'jogo',
      cursor,
    });
    // o tabuleiro físico recebe sempre o quadro mais recente (só sai se estiver conectado)
    conexao.enviarQuadro(montarQuadro({
      estado: estadoJogo,
      estadoOriginal: ui.estadoOriginal,
      vista: ui.vista,
      solucao: ui.solucao?.palitos,
      cursor,
    }));
    renderizarPainel();
    stats.renderizar(estadoExibido);
    controles.renderizar({
      n: estadoJogo.n,
      vista: ui.vista,
      podeDesfazer: estadoJogo.podeDesfazer,
    });
    banners.renderizar({
      vista: ui.vista,
      status: estadoJogo.status,
      solucao: ui.solucao,
      palitosRemovidos: estadoJogo.palitosRemovidos,
    });

    elementos.cartaoTabuleiro.hidden = emDesempenho;
    elementos.stats.hidden = emDesempenho;
    elementos.controles.hidden = emDesempenho;
    elementos.acoes.hidden = emDesempenho;
    elementos.desempenho.hidden = !emDesempenho;

    if (emDesempenho) {
      const resumo = calcularResumo({
        palitosRemovidos: estadoJogo.palitosRemovidos,
        minimo: ui.solucao?.quantidade ?? null,
        iniciadoEm: estadoJogo.iniciadoEm,
        finalizadoEm: estadoJogo.finalizadoEm,
      });
      desempenho.renderizar(resumo, ui.solucao);
      comparacao.renderizar({
        estadoOriginal: ui.estadoOriginal,
        historico: estadoJogo.historico,
        solucao: ui.solucao,
        visivel: ui.solucaoVisivel,
      });
    }
  }

  store.inscrever(() => desenhar());

  await trocarTamanho(TAMANHO_INICIAL);
}
