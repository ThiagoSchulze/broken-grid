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

const TAMANHO_INICIAL = 4;

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
  };

  const store = criarStore({
    vista: 'jogo',
    solucao: null,
    config: null,
    estadoOriginal: null,
    solucaoVisivel: false,
  });
  let jogo = null;
  let dataset = null;
  let buscaAtual = null;

  const tabuleiro = criarTabuleiro(elementos.tabuleiro, {
    aoAtivarPalito: (id) => {
      if (store.obter().vista !== 'jogo') return;
      jogo.removerPalito(id);
    },
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
    aoDesfazer: () => {
      if (!jogo) return;
      jogo.desfazer();
    },
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

    tabuleiro.renderizar(estadoExibido, {
      solucao: emSolucao ? ui.solucao?.palitos : null,
      interativo: ui.vista === 'jogo',
    });
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
