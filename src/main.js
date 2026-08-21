import { criarPartida } from './core/engine.js';
import { carregarDataset, escolherGrade, configDaGrade } from './dataset/loader.js';
import { criarTabuleiro } from './ui/board.js';
import { criarControles } from './ui/controls.js';
import { criarStats } from './ui/stats.js';

const dataset = await carregarDataset(4);
const config = configDaGrade(dataset, escolherGrade(dataset));
const jogo = criarPartida(config);

const tabuleiro = criarTabuleiro(document.querySelector('#tabuleiro'), {
  aoAtivarPalito: (id) => jogo.removerPalito(id),
});
const stats = criarStats(document.querySelector('#stats'));
const controles = criarControles(
  document.querySelector('#controles'),
  document.querySelector('#acoes'),
  { aoDesfazer: () => jogo.desfazer() },
);

jogo.inscrever((estado) => {
  tabuleiro.renderizar(estado);
  stats.renderizar(estado);
  controles.renderizar({ n: estado.n, vista: 'jogo', podeDesfazer: estado.historico.length > 0 });
});

const inicial = jogo.obterEstado();
tabuleiro.renderizar(inicial);
stats.renderizar(inicial);
controles.renderizar({ n: inicial.n, vista: 'jogo', podeDesfazer: false });
