import { criarPartida } from './core/engine.js';
import { carregarDataset, escolherGrade, configDaGrade } from './dataset/loader.js';
import { criarTabuleiro } from './ui/board.js';

const dataset = await carregarDataset(4);
const config = configDaGrade(dataset, escolherGrade(dataset));
const jogo = criarPartida(config);

const tabuleiro = criarTabuleiro(document.querySelector('#tabuleiro'), {
  aoAtivarPalito: (id) => jogo.removerPalito(id),
});

jogo.inscrever((estado) => tabuleiro.renderizar(estado));
tabuleiro.renderizar(jogo.obterEstado());
