// Cartão "Tabuleiro físico": conectar / desconectar o Arduino e ver o estado da ponte.

const TEXTO_SITUACAO = {
  desconectado: 'Desconectado',
  conectando: 'Conectando…',
  conectado: 'Conectado',
  erro: 'Erro',
};

export function criarPainelTabuleiro(elemento, { suportado, aoConectar, aoDesconectar } = {}) {
  elemento.classList.add('cartao', 'painel-tabuleiro');

  const titulo = document.createElement('h2');
  titulo.className = 'painel-tabuleiro__titulo';
  titulo.textContent = 'Tabuleiro físico';

  const situacao = document.createElement('p');
  situacao.className = 'painel-tabuleiro__situacao';
  situacao.setAttribute('aria-live', 'polite');

  const detalhe = document.createElement('p');
  detalhe.className = 'painel-tabuleiro__detalhe';

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao botao--preto botao--largo';
  botao.addEventListener('click', () => {
    if (botao.dataset.acao === 'desconectar') aoDesconectar?.();
    else aoConectar?.();
  });

  const atalhos = document.createElement('p');
  atalhos.className = 'painel-tabuleiro__atalhos';
  atalhos.textContent = 'Teclado (faz o papel dos controles): setas = controle H · W A S D = controle V · '
    + 'Enter = remover · Backspace = voltar · X = solução';

  elemento.append(titulo, situacao, detalhe, botao, atalhos);

  function renderizar({ situacao: s = 'desconectado', mensagem = '', quadros = 0, reenvios = 0,
    ultimoEvento = null, aviso = '' } = {}) {
    if (!suportado) {
      situacao.textContent = 'Indisponível neste navegador';
      detalhe.textContent = 'A conexão com o Arduino usa Web Serial: abra o jogo no Chrome ou no Edge.';
      botao.textContent = 'Conectar tabuleiro';
      botao.disabled = true;
      return;
    }

    situacao.textContent = TEXTO_SITUACAO[s] ?? s;
    situacao.dataset.situacao = s;

    const partes = [];
    if (mensagem) partes.push(mensagem);
    if (aviso) partes.push(aviso);
    if (s === 'conectado') {
      partes.push(`Quadros confirmados: ${quadros}${reenvios ? ` · reenvios: ${reenvios}` : ''}`);
      if (ultimoEvento) partes.push(`Último evento: ${ultimoEvento}`);
    }
    detalhe.textContent = partes.join(' — ');

    const ligado = s === 'conectado' || s === 'conectando';
    botao.dataset.acao = ligado ? 'desconectar' : 'conectar';
    botao.textContent = ligado ? 'Desconectar tabuleiro' : 'Conectar tabuleiro';
    botao.disabled = false;
  }

  renderizar();
  return { renderizar };
}
