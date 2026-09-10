import { rotuloSolucao } from './rotulos.js';

export function criarBanners(elementoSolucao, elementoVitoria, manipuladores = {}) {
  const bannerSolucao = document.createElement('div');
  bannerSolucao.className = 'banner banner--solucao';
  bannerSolucao.hidden = true;

  const textoSolucao = document.createElement('p');
  textoSolucao.className = 'banner__linha';
  textoSolucao.textContent = 'Modo solução — baseado na grade original.';

  const contagemSolucao = document.createElement('p');
  contagemSolucao.className = 'banner__linha';
  bannerSolucao.append(textoSolucao, contagemSolucao);

  const cardVitoria = document.createElement('div');
  cardVitoria.className = 'banner banner--vitoria';
  cardVitoria.hidden = true;
  cardVitoria.setAttribute('role', 'status');

  const tituloVitoria = document.createElement('h2');
  tituloVitoria.className = 'banner__titulo';
  tituloVitoria.textContent = 'Grade Eliminada';

  const removidosVitoria = document.createElement('p');
  removidosVitoria.className = 'banner__linha';

  const estimativaVitoria = document.createElement('p');
  estimativaVitoria.className = 'banner__linha';

  const jogarNovamente = criarBotao('Jogar Novamente', () => manipuladores.aoJogarNovamente?.());
  const verDesempenho = criarBotao('Desempenho', () => manipuladores.aoVerDesempenho?.());

  cardVitoria.append(tituloVitoria, removidosVitoria, estimativaVitoria, jogarNovamente, verDesempenho);
  elementoSolucao.append(bannerSolucao);
  elementoVitoria.append(cardVitoria);

  return {
    renderizar({ vista, status, solucao, palitosRemovidos }) {
      bannerSolucao.hidden = vista !== 'solucao';
      if (vista === 'solucao' && solucao) {
        contagemSolucao.textContent = `${rotuloSolucao(solucao)}: ${solucao.quantidade} palito(s).`;
      }

      const mostrarVitoria = status === 'vencido' && vista !== 'solucao';
      cardVitoria.hidden = !mostrarVitoria;
      verDesempenho.hidden = vista === 'desempenho';
      if (mostrarVitoria) {
        removidosVitoria.textContent = `${palitosRemovidos} palitos removidos`;
        estimativaVitoria.textContent = solucao
          ? `${rotuloSolucao(solucao)}: ${solucao.quantidade} palitos`
          : 'Solução de referência indisponível';
      }
    },
  };
}

function criarBotao(texto, aoClicar) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao botao--verde';
  botao.textContent = texto;
  botao.addEventListener('click', aoClicar);
  return botao;
}
