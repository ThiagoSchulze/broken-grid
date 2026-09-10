import { calcularLayout, coordenadasDoPalito } from './layout.js';
import { ESTADOS } from '../core/rules.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROTULO_ESTADO = {
  [ESTADOS.REMOVIVEL]: 'removivel',
  [ESTADOS.BLOQUEADO]: 'bloqueado',
  [ESTADOS.QUEBRADO]: 'quebrado',
  [ESTADOS.REMOVIDO]: 'removido',
};

export function criarTabuleiro(svg, { aoAtivarPalito } = {}) {
  let layoutAtual = null;
  let nAtual = null;
  const grupos = new Map();

  svg.addEventListener('click', (evento) => {
    const grupo = evento.target.closest('[data-id]');
    if (grupo && aoAtivarPalito) aoAtivarPalito(grupo.dataset.id);
  });

  svg.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    const grupo = evento.target.closest('[data-id]');
    if (!grupo) return;
    evento.preventDefault();
    if (aoAtivarPalito) aoAtivarPalito(grupo.dataset.id);
  });

  function reconstruir(n) {
    layoutAtual = calcularLayout(n);
    nAtual = n;
    grupos.clear();
    svg.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${layoutAtual.largura} ${layoutAtual.altura}`);
  }

  function obterGrupo(id) {
    if (grupos.has(id)) return grupos.get(id);

    const coordenadas = coordenadasDoPalito(id, layoutAtual);
    if (!coordenadas) return null;

    const grupo = document.createElementNS(SVG_NS, 'g');
    grupo.dataset.id = id;

    for (const classe of ['palito__toque', 'palito__linha']) {
      const linha = document.createElementNS(SVG_NS, 'line');
      linha.setAttribute('class', classe);
      linha.setAttribute('x1', coordenadas.x1);
      linha.setAttribute('y1', coordenadas.y1);
      linha.setAttribute('x2', coordenadas.x2);
      linha.setAttribute('y2', coordenadas.y2);
      grupo.append(linha);
    }

    svg.append(grupo);
    grupos.set(id, grupo);
    return grupo;
  }

  function renderizar(estado, { solucao = null, interativo = true, classeDestaque = 'palito--solucao' } = {}) {
    if (estado.n !== nAtual) reconstruir(estado.n);
    const destacados = new Set(solucao ?? []);
    // hover e cursor de mao so valem onde o clique faz alguma coisa
    svg.classList.toggle('tabuleiro--interativo', interativo);

    for (const [id, situacao] of Object.entries(estado.palitos)) {
      const grupo = obterGrupo(id);
      if (!grupo) continue;

      const classes = ['palito', `palito--${ROTULO_ESTADO[situacao]}`];
      if (destacados.has(id)) classes.push(classeDestaque);
      grupo.setAttribute('class', classes.join(' '));

      const clicavel = interativo && situacao === ESTADOS.REMOVIVEL;
      if (clicavel) {
        grupo.setAttribute('tabindex', '0');
        grupo.setAttribute('role', 'button');
        grupo.setAttribute('aria-label', descrever(id, situacao));
        grupo.removeAttribute('aria-hidden');
      } else {
        grupo.removeAttribute('tabindex');
        grupo.removeAttribute('role');
        grupo.setAttribute('aria-hidden', 'true');
      }
    }
  }

  return { renderizar };
}

function descrever(id, situacao) {
  const [orientacao, linha, coluna] = id.split(':');
  const nome = orientacao === 'h' ? 'horizontal' : 'vertical';
  return `Palito ${nome} linha ${linha} coluna ${coluna}, ${ROTULO_ESTADO[situacao]}`;
}
