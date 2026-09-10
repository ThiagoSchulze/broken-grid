import { criarTabuleiro } from './board.js';
import { rotuloSolucao } from './rotulos.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function criarComparacao(elemento, { aoAlternar } = {}) {
  const raiz = document.createElement('div');
  raiz.className = 'cartao comparacao';

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao botao--ouro botao--largo';
  botao.textContent = 'Exibir Solução';
  botao.setAttribute('aria-expanded', 'false');
  botao.setAttribute('aria-controls', 'comparacao-grades');
  botao.setAttribute('aria-describedby', 'comparacao-aviso');
  botao.addEventListener('click', () => aoAlternar?.());

  const aviso = document.createElement('p');
  aviso.className = 'comparacao__aviso';
  aviso.id = 'comparacao-aviso';
  aviso.textContent = 'Solução de referência indisponível.';
  aviso.hidden = true;

  const grades = document.createElement('div');
  grades.className = 'comparacao__grades';
  grades.id = 'comparacao-grades';
  grades.hidden = true;

  const suaJogada = criarColuna('Sua solução');
  const doSolver = criarColuna('Solução');
  grades.append(suaJogada.raiz, doSolver.raiz);

  const legenda = document.createElement('ul');
  legenda.className = 'legenda comparacao__legenda';
  legenda.hidden = true;
  legenda.append(
    itemLegenda('amostra--jogada', 'Você removeu'),
    itemLegenda('amostra--otima', 'A solução remove'),
  );

  raiz.append(botao, aviso, grades, legenda);
  elemento.append(raiz);

  return {
    renderizar({ estadoOriginal, historico, solucao, visivel }) {
      const disponivel = Boolean(estadoOriginal && solucao);
      botao.disabled = !disponivel;
      aviso.hidden = disponivel;

      const aberto = disponivel && visivel;
      botao.textContent = aberto ? 'Ocultar Solução' : 'Exibir Solução';
      botao.setAttribute('aria-expanded', String(aberto));
      grades.hidden = !aberto;
      legenda.hidden = !aberto;
      // os palitos so sao pintados quando o painel abre
      if (!aberto) return;

      suaJogada.definirRotulo('Sua solução');
      suaJogada.contagem.textContent = `${historico.length} palito(s)`;
      suaJogada.tabuleiro.renderizar(estadoOriginal, {
        solucao: historico,
        interativo: false,
        classeDestaque: 'palito--jogada',
      });

      doSolver.definirRotulo(rotuloSolucao(solucao));
      doSolver.contagem.textContent = `${solucao.quantidade} palito(s)`;
      doSolver.tabuleiro.renderizar(estadoOriginal, {
        solucao: solucao.palitos,
        interativo: false,
        classeDestaque: 'palito--otima',
      });
    },
  };
}

function criarColuna(rotuloInicial) {
  const raiz = document.createElement('div');
  raiz.className = 'comparacao__coluna';

  const titulo = document.createElement('h3');
  titulo.className = 'comparacao__titulo';
  titulo.textContent = rotuloInicial;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tabuleiro');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Tabuleiro: ${rotuloInicial}`);

  const contagem = document.createElement('p');
  contagem.className = 'comparacao__contagem';

  raiz.append(titulo, svg, contagem);

  return {
    raiz,
    contagem,
    tabuleiro: criarTabuleiro(svg),
    definirRotulo(texto) {
      titulo.textContent = texto;
      svg.setAttribute('aria-label', `Tabuleiro: ${texto}`);
    },
  };
}

function itemLegenda(classe, texto) {
  const item = document.createElement('li');

  const amostra = document.createElement('span');
  amostra.className = `amostra ${classe}`;

  item.append(amostra, document.createTextNode(texto));
  return item;
}
