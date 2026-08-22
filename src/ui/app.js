import { criarPartida } from '../core/engine.js';
import { calcularResumo } from '../core/metrics.js';
import { resolver } from '../solver/index.js';
import { carregarDataset, escolherGrade, configDaGrade, ErroDataset } from '../dataset/loader.js';
import { criarStore } from './store.js';
import { criarTabuleiro } from './board.js';
import { criarControles } from './controls.js';
import { criarStats } from './stats.js';
import { criarBanners } from './banners.js';
import { criarDesempenho } from './performance.js';

const TAMANHO_INICIAL = 4;

export async function iniciarAplicacao(documento) {
  const elementos = {
    tabuleiro: documento.querySelector('#tabuleiro'),
    controles: documento.querySelector('#controles'),
    acoes: documento.querySelector('#acoes'),
    stats: documento.querySelector('#stats'),
    banners: documento.querySelector('#banners'),
    desempenho: documento.querySelector('#desempenho'),
    erro: documento.querySelector('#erro'),
    cartaoTabuleiro: documento.querySelector('.cartao--tabuleiro'),
  };

  const store = criarStore({ vista: 'jogo', solucao: null, config: null, tique: 0 });
  let jogo = null;
  let dataset = null;

  const tabuleiro = criarTabuleiro(elementos.tabuleiro, {
    aoAtivarPalito: (id) => {
      if (store.obter().vista !== 'jogo') return;
      jogo.removerPalito(id);
    },
  });
  const stats = criarStats(elementos.stats);
  const desempenho = criarDesempenho(elementos.desempenho);
  const banners = criarBanners(elementos.banners, {
    aoJogarNovamente: () => {
      const { config } = store.obter();
      if (!config) return;
      novaGrade(config.n);
    },
    // Busca a solucao de referencia sob demanda, uma unica vez, ANTES de
    // trocar a vista — nunca a partir de um assinante do store (evita
    // atualizar o store durante a propria notificacao dos ouvintes).
    aoVerDesempenho: async () => {
      try {
        const ui = store.obter();
        if (!ui.config) return;
        const solucao = ui.solucao ?? await resolver(ui.config);
        store.atualizar({ vista: 'desempenho', solucao });
        limparErro();
      } catch (erro) {
        relatarErro(`Não foi possível obter a solução de referência: ${erro.message}`);
      }
    },
  });
  // Os controles ja estao no DOM enquanto o primeiro dataset carrega, mas
  // `jogo` e `config` so existem depois. Cada handler checa sua propria
  // pre-condicao — esconder #controles piscaria a tela inicial.
  const controles = criarControles(elementos.controles, elementos.acoes, {
    aoEscolherTamanho: (n) => {
      if (!store.obter().config) return;
      trocarTamanho(n);
    },
    aoNovoGrid: () => {
      const { config } = store.obter();
      if (!config) return;
      novaGrade(config.n);
    },
    aoSolucionar: () => {
      if (!store.obter().config) return;
      mostrarSolucao();
    },
    aoVoltarJogo: () => store.atualizar({ vista: 'jogo' }),
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
    elementos.erro.hidden = true;
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

    store.atualizar({ vista: 'jogo', solucao: null, config });
    desenhar(jogo.obterEstado());
  }

  async function mostrarSolucao() {
    try {
      const solucao = await resolver(store.obter().config);
      store.atualizar({ vista: 'solucao', solucao });
      limparErro();
    } catch (erro) {
      relatarErro(`Não foi possível calcular a solução: ${erro.message}`);
    }
  }

  function desenhar(estadoJogo = jogo.obterEstado()) {
    const ui = store.obter();
    const emSolucao = ui.vista === 'solucao';
    const emDesempenho = ui.vista === 'desempenho';

    tabuleiro.renderizar(estadoJogo, {
      solucao: emSolucao ? ui.solucao?.palitos : null,
      interativo: ui.vista === 'jogo',
    });
    stats.renderizar(estadoJogo);
    controles.renderizar({
      n: estadoJogo.n,
      vista: ui.vista,
      podeDesfazer: estadoJogo.historico.length > 0,
    });
    banners.renderizar({
      vista: ui.vista,
      status: estadoJogo.status,
      solucao: ui.solucao,
      palitosRemovidos: estadoJogo.palitosRemovidos,
    });

    // O prototipo da tela de desempenho nao mostra tabuleiro, stats nem os
    // controles (seletor, Novo Grid, Solucionar) — so tiles, grafico e o
    // card de vitoria, que continua vindo de #banners.
    elementos.cartaoTabuleiro.hidden = emDesempenho;
    elementos.stats.hidden = emDesempenho;
    elementos.controles.hidden = emDesempenho;
    elementos.acoes.hidden = emDesempenho;
    elementos.desempenho.hidden = !emDesempenho;

    if (emDesempenho) {
      desempenho.renderizar(calcularResumo({
        palitosRemovidos: estadoJogo.palitosRemovidos,
        minimo: ui.solucao?.quantidade ?? null,
        iniciadoEm: estadoJogo.iniciadoEm,
        finalizadoEm: estadoJogo.finalizadoEm,
      }));
    }
  }

  store.inscrever(() => desenhar());

  await trocarTamanho(TAMANHO_INICIAL);
}
