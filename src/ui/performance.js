import { formatarPercentual } from '../core/metrics.js';
import { rotuloSolucao } from './rotulos.js';

export function criarDesempenho(elemento) {
  const tiles = document.createElement('div');
  tiles.className = 'cartao tiles';

  const tempo = criarTile('Tempo');
  const removidos = criarTile('Palitos Removidos');
  const referencia = criarTile('Solução');
  const eficiencia = criarTile('Eficiência');
  tiles.append(tempo.raiz, removidos.raiz, referencia.raiz, eficiencia.raiz);

  const grafico = document.createElement('div');
  grafico.className = 'cartao grafico';

  const titulo = document.createElement('h2');
  titulo.className = 'grafico__titulo';
  titulo.textContent = 'Seu Resultado × Solução';

  const barraJogador = criarBarra('Seu Resultado', 'barra--jogador');
  const barraReferencia = criarBarra('Solução', 'barra--referencia');

  const excedentes = document.createElement('p');
  excedentes.className = 'grafico__nota';

  grafico.append(titulo, barraJogador.raiz, barraReferencia.raiz, excedentes);

  elemento.append(tiles, grafico);

  return {
    renderizar(resumo, solucao = null) {
      const rotulo = rotuloSolucao(solucao);

      tempo.valor.textContent = resumo.tempoFormatado;
      removidos.valor.textContent = String(resumo.palitosRemovidos);
      referencia.rotulo.textContent = rotulo;
      referencia.valor.textContent = resumo.minimo === null ? '—' : String(resumo.minimo);
      eficiencia.valor.textContent = formatarPercentual(resumo.eficiencia);
      titulo.textContent = `Seu Resultado × ${rotulo}`;
      excedentes.textContent = textoExcedentes(resumo.excedentes, rotulo);

      const maior = Math.max(resumo.palitosRemovidos, resumo.minimo ?? 0, 1);
      barraJogador.aplicar(resumo.palitosRemovidos, maior);
      barraReferencia.rotulo.textContent = rotulo;
      barraReferencia.aplicar(resumo.minimo ?? 0, maior);
    },
  };
}

function criarTile(rotulo) {
  const raiz = document.createElement('div');
  raiz.className = 'tile';

  const valor = document.createElement('strong');
  valor.className = 'tile__valor';
  valor.textContent = '—';

  const texto = document.createElement('span');
  texto.className = 'tile__rotulo';
  texto.textContent = rotulo;

  raiz.append(valor, texto);
  return { raiz, valor, rotulo: texto };
}

function criarBarra(rotulo, classe) {
  const raiz = document.createElement('div');
  raiz.className = 'barra';

  const nome = document.createElement('span');
  nome.className = 'barra__rotulo';
  nome.textContent = rotulo;

  const trilha = document.createElement('div');
  trilha.className = 'barra__trilha';

  const preenchimento = document.createElement('div');
  preenchimento.className = `barra__preenchimento ${classe}`;

  const valor = document.createElement('span');
  valor.className = 'barra__valor';

  trilha.append(preenchimento);
  raiz.append(nome, trilha, valor);

  return {
    raiz,
    rotulo: nome,
    aplicar(quantia, maior) {
      preenchimento.style.width = `${Math.round((quantia / maior) * 100)}%`;
      valor.textContent = String(quantia);
    },
  };
}

function textoExcedentes(excedentes, rotulo) {
  const alvo = rotulo.toLowerCase();
  if (excedentes === null) return 'Solução de referência indisponível.';
  if (excedentes === 0) return `Empatou com a ${alvo}.`;
  if (excedentes < 0) return `${-excedentes} remoção(ões) a MENOS que a ${alvo}.`;
  return `${excedentes} remoção(ões) além da ${alvo}.`;
}
